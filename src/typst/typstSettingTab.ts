import {
	App,
	DropdownComponent,
	Modal,
	Notice,
	Platform,
	Setting,
	TextAreaComponent,
	TextComponent,
} from "obsidian";
import type BonWorkflow from "../main";
import { DEFAULT_SCRIPT_CONTENT } from "./typstScriptManager";
import type { TypstScriptManager } from "./typstScriptManager";
import type {
	TypstSettings,
	TypstTransformMode,
	TypstPreviewMode,
	TypstCompileFormat,
} from "./typstSettings";
import { BonWorkflowSettingTab } from "../settingTab";
import {
	downloadAndCacheWasm,
	loadLocalWasmFile,
	WasmStorageInfo,
} from "./typstWasmStorage";

/**
 * Check if Typst CLI is installed and get version using path resolver
 */
async function detectTypstCLI(
	resolver: import("./typstPathResolver").TypstPathResolver,
	customPath?: string,
): Promise<{
	installed: boolean;
	path?: string;
	version?: string;
	method?: string;
	error?: string;
}> {
	try {
		const result = await resolver.getDetectionResult(customPath);
		if (result) {
			return {
				installed: true,
				path: result.path,
				version: result.version,
				method: result.method,
			};
		}
		return { installed: false };
	} catch (error) {
		return {
			installed: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

interface ScriptEditorModalOptions {
	mode: "create" | "edit";
	scriptName?: string;
	initialContent: string;
	onSubmit: (name: string, content: string) => Promise<void>;
}

class ScriptEditorModal extends Modal {
	constructor(app: App, private readonly options: ScriptEditorModalOptions) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();

		const title =
			this.options.mode === "create"
				? "Create Typst Script"
				: `Edit Script: ${this.options.scriptName}`;
		new Setting(contentEl).setHeading().setName(title);

		let nameInput: TextComponent | null = null;
		if (this.options.mode === "create") {
			new Setting(contentEl)
				.setName("Script name")
				.setDesc("Enter the name only, no .js suffix required")
				.addText((text) => {
					nameInput = text;
					text.setPlaceholder("report").setValue(
						this.options.scriptName ?? ""
					);
				});
		} else {
			contentEl.createEl("p", {
				text: `Current script: ${this.options.scriptName}`,
			});
		}

		const editor = new TextAreaComponent(contentEl);
		editor.inputEl.rows = 18;
		editor.inputEl.spellcheck = false;
		editor
			.setPlaceholder("function transform(content) { return content; }")
			.setValue(this.options.initialContent);

		const buttons = contentEl.createDiv({ cls: "modal-button-container" });
		const cancelButton = buttons.createEl("button", { text: "Cancel" });
		cancelButton.addEventListener("click", () => this.close());

		const submitButton = buttons.createEl("button", {
			text: "Save",
			cls: "mod-cta",
		});
		submitButton.addEventListener("click", async () => {
			const rawName =
				this.options.mode === "create"
					? nameInput?.getValue() ?? ""
					: this.options.scriptName ?? "";
			const sanitizedName = rawName.replace(/[\\\/]/g, "").trim();
			if (!sanitizedName) {
				new Notice("Script name cannot be empty");
				return;
			}

			try {
				await this.options.onSubmit(sanitizedName, editor.getValue());
				this.close();
			} catch (error) {
				const message =
					error instanceof Error ? error.message : String(error);
				new Notice(message);
			}
		});
	}
}

async function refreshScriptOptions(
	dropdown: DropdownComponent,
	manager: TypstScriptManager | null
): Promise<string[]> {
	if (!manager) {
		dropdown.setDisabled(true);
		return [];
	}

	const scripts = await manager.listScripts();
	const selectEl = dropdown.selectEl;
	while (selectEl.firstChild) {
		selectEl.removeChild(selectEl.firstChild);
	}

	if (!scripts.length) {
		const option = document.createElement("option");
		option.value = "";
		option.textContent = "No scripts available";
		selectEl.appendChild(option);
		dropdown.setDisabled(true);
		return [];
	}

	scripts.forEach((script) => {
		const option = document.createElement("option");
		option.value = script;
		option.textContent = script;
		selectEl.appendChild(option);
	});
	dropdown.setDisabled(false);
	if (!scripts.includes(dropdown.getValue())) {
		dropdown.setValue(scripts[0]);
	}
	return scripts;
}

export function renderTypstSettings(
	containerEl: HTMLElement,
	plugin: BonWorkflow,
	settingTab: BonWorkflowSettingTab
) {
	const typstSettings = plugin.settings.typst as TypstSettings | undefined;
	const manager = plugin.getTypstScriptManager();
	const converter = plugin.getTypstConverter();
	const resolver = converter?.getPathResolver();

	const section = containerEl.createDiv({ cls: "typst-settings" });

	new Setting(section)
		.setHeading()
		.setName("Typst toolbox settings")
		.setDesc(
			"I always use Typst to export pdf for work, but I found I want to use markdown to write and export to pdf."
		);

	new Setting(section).setName("Enable Typst").addToggle((toggle) =>
		toggle.setValue(typstSettings.enabled).onChange(async (value) => {
			typstSettings.enabled = value;
			await plugin.saveSettings();
			if (value) {
				await plugin.refreshTypstFeatures();
			} else {
				await plugin.unloadTypstFeatures();
			}

			setTimeout(() => {
				settingTab.display();
			}, 800);
		})
	);

	if (!typstSettings.enabled) {
		return;
	}

	if (!typstSettings) {
		section.createEl("p", {
			text: "Typst settings not initialized, please try again later.",
		});
		return;
	}

	new Setting(section)
		.setName("Trigger tags")
		.setDesc(
			"Typst conversion is triggered if any of these tags are present in frontmatter"
		)
		.addText((text) => {
			text.setPlaceholder("bon-typst")
				.setValue(typstSettings.triggerTags.join(", "))
				.onChange(async (value) => {
					const tags = value
						.split(",")
						.map((tag) =>
							tag.replace(/^#/, "").trim().toLowerCase()
						)
						.filter(Boolean);
					typstSettings.triggerTags = tags.length
						? tags
						: ["bon-typst"];
					await plugin.saveSettings();
				});
		});

	new Setting(section)
		.setName("Auto compile Typst")
		.setDesc(
			"Automatically convert and compile Typst when file changes are detected. If disabled, no automatic conversion will occur (use commands to manually convert)."
		)
		.addToggle((toggle) =>
			toggle
				.setValue(typstSettings.autoCompile)
				.onChange(async (value) => {
					typstSettings.autoCompile = value;
					await plugin.saveSettings();
				})
		);

	new Setting(section)
		.setName("Transform engine")
		.setDesc(
			"Choose built-in AST transform or continue using custom scripts"
		)
		.addDropdown((dropdown) => {
			dropdown.addOption("ast", "Built-in AST");
			dropdown.addOption("script", "Custom Script");
			dropdown
				.setValue(typstSettings.transformMode ?? "ast")
				.onChange(async (value) => {
					typstSettings.transformMode = value as TypstTransformMode;
					await plugin.saveSettings();
					await plugin.refreshTypstFeatures();
					new Notice("Typst transform engine updated");
				});
		});
	new Setting(section)
		.setName("Max embed depth")
		.setDesc(
			"Limit the recursion depth of ![[file]] embeds to avoid cyclic references"
		)
		.addSlider((slider) => {
			slider
				.setLimits(1, 10, 1)
				.setDynamicTooltip()
				.setValue(typstSettings.maxEmbedDepth ?? 5)
				.onChange(async (value) => {
					typstSettings.maxEmbedDepth = value;
					await plugin.saveSettings();
				});
		});

	// 代码块渲染设置
	new Setting(section).setHeading().setName("Code block rendering");
	new Setting(section)
		.setName("Enable Typst code block rendering")
		.setDesc(
			"Render typst code blocks as SVG in reading mode (uses WASM, no CLI required)"
		)
		.addToggle((toggle) =>
			toggle
				.setValue(typstSettings.enableCodeBlock ?? true)
				.onChange(async (value) => {
					typstSettings.enableCodeBlock = value;
					await plugin.saveSettings();
					new Notice(
						value
							? "Typst code block rendering enabled. Please reload to take effect."
							: "Typst code block rendering disabled. Please reload to take effect."
					);
				})
		);

	// CLI 状态检测 - Only show on desktop
	if (Platform.isDesktopApp) {
		new Setting(section).setHeading().setName("Typst CLI");
		const cliStatusSetting = new Setting(section)
			.setName("CLI status")
			.setDesc("Checking Typst CLI installation...");

		// 异步检测 CLI 状态
		void (async () => {
			if (!resolver) {
				cliStatusSetting.setDesc("⚠️ Typst features not initialized");
				return;
			}

			const cliInfo = await detectTypstCLI(
				resolver,
				typstSettings.typstCliPath,
			);

			if (cliInfo.installed) {
				const methodLabel =
					{
						custom: "Custom Path",
						system: "System PATH",
						detected: "Auto-detected",
					}[cliInfo.method || "unknown"] || "Unknown";

				cliStatusSetting.setDesc(
					`✅ ${methodLabel}: ${cliInfo.path}\n📦 Version: ${cliInfo.version || "unknown"}`,
				);
			} else {
				// Platform-specific error messages
				let errorMessage =
					"⚠️ Typst CLI not found. Install Typst or set custom path below.";

				if (Platform.isMacOS) {
					errorMessage +=
						"\n💡 Mac detected: If installed via Homebrew, auto-detection should work.";
					errorMessage += "\n📦 Install: brew install typst";
				} else if (Platform.isWin) {
					errorMessage +=
						"\n💡 Windows detected: Install via Cargo or download binary.";
					errorMessage += "\n📦 Install: cargo install typst-cli";
				} else if (Platform.isLinux) {
					errorMessage +=
						"\n💡 Linux detected: Install via package manager or Cargo.";
					errorMessage += "\n📦 Install: cargo install typst-cli";
				}

				errorMessage +=
					"\n📥 Download: https://github.com/typst/typst/releases";

				cliStatusSetting.setDesc(errorMessage);
			}
		})();

		// 自定义 Typst CLI 路径配置 - Platform-aware examples
		const getPathExamples = (): string => {
			if (Platform.isMacOS) {
				return "Examples (Mac): /opt/homebrew/bin/typst, ~/.cargo/bin/typst";
			} else if (Platform.isWin) {
				return "Examples (Windows): C:\\Program Files\\Typst\\typst.exe";
			} else if (Platform.isLinux) {
				return "Examples (Linux): /usr/local/bin/typst, ~/.cargo/bin/typst";
			}
			return "Example: /path/to/typst";
		};

		new Setting(section)
			.setName("Custom Typst CLI path (optional)")
			.setDesc(
				"Override auto-detection by specifying full path to typst executable.\n" +
					getPathExamples(),
			)
			.addText((text) => {
				text.setPlaceholder("Leave empty for auto-detection")
					.setValue(typstSettings.typstCliPath ?? "")
					.onChange(async (value) => {
						const trimmed = value.trim();
						typstSettings.typstCliPath = trimmed || undefined;
						await plugin.saveSettings();

						// Clear cache to trigger re-detection
						if (resolver) {
							resolver.clearCache();
						}
					});
			})
			.addButton((btn) => {
				btn.setButtonText("Test")
					.setTooltip("Test if the specified path is valid")
					.onClick(async () => {
						if (!resolver) {
							new Notice("Typst features not initialized");
							return;
						}

						const testPath = typstSettings.typstCliPath;
						if (!testPath) {
							new Notice("Please enter a path to test");
							return;
						}

						const result = await detectTypstCLI(resolver, testPath);
						if (result.installed) {
							new Notice(
								`✅ Valid Typst CLI\nPath: ${result.path}\nVersion: ${result.version}`,
							);
						} else {
							new Notice(
								`❌ Invalid path: ${testPath}\n${result.error || "Command not found"}`,
							);
						}
					});
			});
	} else {
		// Mobile: Show info message instead of CLI settings
		new Setting(section).setHeading().setName("Typst CLI");
		new Setting(section)
			.setName("CLI compilation not available")
			.setDesc(
				"📱 CLI compilation is only available on desktop.\n" +
					"💡 On mobile, use WASM preview mode for real-time rendering.\n" +
					"ℹ️ WASM mode doesn't support external packages but works offline.",
			);
	}

	// 预览模式设置
	new Setting(section)
		.setName("File-level preview mode")
		.setDesc(
			"For Markdown files with trigger tags. WASM: Fast (no packages). Compile: Full support (requires Typst CLI)."
		)
		.addDropdown((dropdown) => {
			dropdown.addOption("compile", "Compile with CLI (Recommended)");
			dropdown.addOption("wasm", "WASM Preview (No Packages)");
			dropdown.addOption("none", "No Preview");
			dropdown
				.setValue(typstSettings.previewMode ?? "compile")
				.onChange(async (value) => {
					typstSettings.previewMode = value as TypstPreviewMode;
					await plugin.saveSettings();
					new Notice(`Preview mode set to: ${value}`);
				});
		});

	// CLI 编译输出格式
	new Setting(section)
		.setName("CLI compile format")
		.setDesc(
			"Output format when using CLI compilation. SVG: Vector (best for preview). PNG: Raster image. PDF: Document."
		)
		.addDropdown((dropdown) => {
			dropdown.addOption("svg", "SVG (Vector)");
			dropdown.addOption("png", "PNG (Image)");
			dropdown.addOption("pdf", "PDF (Document)");
			dropdown
				.setValue(typstSettings.compileFormat ?? "svg")
				.onChange(async (value) => {
					typstSettings.compileFormat = value as TypstCompileFormat;
					await plugin.saveSettings();
					new Notice(`Compile format set to: ${value}`);
				});
		});

	// 外部包支持说明
	new Setting(section)
		.setName("External Typst packages")
		.setDesc(
			"⚠️ WASM rendering does not support external packages (@preview/...). To use external packages, switch Preview Mode to 'Compile with CLI' and install Typst CLI."
		);

	// WASM 管理设置
	renderWasmManagementSettings(section, plugin);

	new Setting(section)
		.setName("Code block cache size")
		.setDesc(
			"Number of compiled SVG results to cache (larger = more memory)"
		)
		.addSlider((slider) => {
			slider
				.setLimits(10, 500, 10)
				.setDynamicTooltip()
				.setValue(typstSettings.codeBlockCacheSize ?? 100)
				.onChange(async (value) => {
					typstSettings.codeBlockCacheSize = value;
					await plugin.saveSettings();
				});
		});

	let pendingDirectory = typstSettings.scriptDirectory;
	new Setting(section)
		.setName("Script directory")
		.setDesc("Vault-relative path for storing Typst transform scripts")
		.addText((text) => {
			text.setPlaceholder("typst-scripts")
				.setValue(typstSettings.scriptDirectory)
				.onChange((value) => {
					pendingDirectory = value.trim() || "typst-scripts";
				});
			text.inputEl.addEventListener("blur", async () => {
				if (pendingDirectory === typstSettings.scriptDirectory) {
					return;
				}
				typstSettings.scriptDirectory = pendingDirectory;
				await plugin.saveSettings();
				await plugin.refreshTypstFeatures();
				new Notice("Typst script directory updated");
			});
			text.inputEl.addEventListener("keydown", (event) => {
				if (event.key === "Enter") {
					event.preventDefault();
					text.inputEl.blur();
				}
			});
		});

	new Setting(section).setHeading().setName("Script management");
	const scriptSetting = new Setting(section)
		.setName("Script list")
		.setDesc("Manage Typst transform scripts");

	let dropdown: DropdownComponent | null = null;
	scriptSetting.addDropdown((drop) => {
		dropdown = drop;
		drop.setDisabled(!manager);
	});

	let cachedScripts: string[] = [];
	if (manager && dropdown) {
		void (async () => {
			cachedScripts = await refreshScriptOptions(dropdown!, manager);
		})();
	} else {
		scriptSetting.setDesc("Script manager is not initialized");
	}

	scriptSetting.addButton((button) =>
		button
			.setButtonText("Create")
			.setCta()
			.setDisabled(!manager)
			.onClick(() => {
				if (!manager || !dropdown) {
					return;
				}
				new ScriptEditorModal(plugin.app, {
					mode: "create",
					initialContent: DEFAULT_SCRIPT_CONTENT,
					onSubmit: async (name, content) => {
						await manager.saveScript(name, content);
						new Notice(`Script ${name} created`);
						cachedScripts = await refreshScriptOptions(
							dropdown!,
							manager
						);
					},
				}).open();
			})
	);

	scriptSetting.addButton((button) =>
		button
			.setButtonText("Edit")
			.setDisabled(!manager)
			.onClick(async () => {
				if (!manager || !dropdown) {
					return;
				}
				const scriptName = dropdown.getValue();
				if (!scriptName) {
					new Notice("Please select a script to edit");
					return;
				}
				const content = await manager.loadScript(scriptName);
				new ScriptEditorModal(plugin.app, {
					mode: "edit",
					scriptName,
					initialContent: content,
					onSubmit: async (_name, updated) => {
						await manager.saveScript(scriptName, updated);
						new Notice(`Script ${scriptName} updated`);
					},
				}).open();
			})
	);

	scriptSetting.addButton((button) =>
		button
			.setButtonText("Delete")
			.setDisabled(!manager)
			.onClick(async () => {
				if (!manager || !dropdown) {
					return;
				}
				const scriptName = dropdown.getValue();
				if (!scriptName) {
					new Notice("Please select a script to delete");
					return;
				}
				try {
					await manager.deleteScript(scriptName);
					new Notice(`Script ${scriptName} deleted`);
					cachedScripts = await refreshScriptOptions(
						dropdown!,
						manager
					);
					if (cachedScripts.length === 0) {
						dropdown.setValue("");
					}
				} catch (error) {
					const message =
						error instanceof Error ? error.message : String(error);
					new Notice(message);
				}
			})
	);
}

/**
 * CDN URLs for WASM files
 */
const WASM_CDN_URLS = {
	compiler:
		"https://cdn.jsdelivr.net/npm/@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler_bg.wasm",
	renderer:
		"https://cdn.jsdelivr.net/npm/@myriaddreamin/typst-ts-renderer/pkg/typst_ts_renderer_bg.wasm",
};

/**
 * 获取 WASM 版本号（从 CDN URL 推断）
 */
const WASM_VERSION = "latest"; // 可以从 package.json 读取

/**
 * 渲染 WASM 管理设置
 */
function renderWasmManagementSettings(
	containerEl: HTMLElement,
	plugin: BonWorkflow
) {
	new Setting(containerEl).setHeading().setName("WASM module management");

	const wasmRenderer = plugin.getTypstWasmRenderer();
	const storage = wasmRenderer?.getStorage();

	if (!storage) {
		new Setting(containerEl)
			.setName("WASM status")
			.setDesc(
				"WASM renderer not initialized. Enable code block rendering first."
			);
		return;
	}

	// WASM 状态显示
	const statusSetting = new Setting(containerEl)
		.setName("WASM status")
		.setDesc("Loading...");

	// 更新状态显示
	const updateStatus = async () => {
		try {
			const infos = await storage.listAll();
			if (infos.length === 0) {
				statusSetting.setDesc(
					"⚠️ No WASM files cached. Download them to use code block rendering."
				);
			} else {
				const statusLines = infos.map((info: WasmStorageInfo) => {
					const sizeMB = (info.size / 1024 / 1024).toFixed(2);
					return `✅ ${info.name}: v${info.version} (${sizeMB} MB)`;
				});
				statusSetting.setDesc(statusLines.join("\n"));
			}
		} catch (error) {
			statusSetting.setDesc(
				`❌ Error: ${
					error instanceof Error ? error.message : String(error)
				}`
			);
		}
	};

	void updateStatus();

	// 下载按钮
	new Setting(containerEl)
		.setName("Download WASM from CDN")
		.setDesc(
			"Download WASM files from jsdelivr CDN and cache to IndexedDB (~6MB total)"
		)
		.addButton((button) =>
			button.setButtonText("Download Compiler").onClick(async () => {
				button.setDisabled(true);
				button.setButtonText("Downloading...");

				try {
					await downloadAndCacheWasm(
						WASM_CDN_URLS.compiler,
						"compiler",
						WASM_VERSION,
						storage,
						(loaded, total) => {
							const percent = ((loaded / total) * 100).toFixed(0);
							button.setButtonText(`${percent}%`);
						}
					);
					new Notice("Compiler WASM downloaded successfully");
					await updateStatus();
				} catch (error) {
					new Notice(
						`Failed to download: ${
							error instanceof Error
								? error.message
								: String(error)
						}`
					);
				} finally {
					button.setDisabled(false);
					button.setButtonText("Download Compiler");
				}
			})
		)
		.addButton((button) =>
			button.setButtonText("Download Renderer").onClick(async () => {
				button.setDisabled(true);
				button.setButtonText("Downloading...");

				try {
					await downloadAndCacheWasm(
						WASM_CDN_URLS.renderer,
						"renderer",
						WASM_VERSION,
						storage,
						(loaded, total) => {
							const percent = ((loaded / total) * 100).toFixed(0);
							button.setButtonText(`${percent}%`);
						}
					);
					new Notice("Renderer WASM downloaded successfully");
					await updateStatus();
				} catch (error) {
					new Notice(
						`Failed to download: ${
							error instanceof Error
								? error.message
								: String(error)
						}`
					);
				} finally {
					button.setDisabled(false);
					button.setButtonText("Download Renderer");
				}
			})
		)
		.addButton((button) =>
			button
				.setButtonText("Download Both")
				.setCta()
				.onClick(async () => {
					button.setDisabled(true);
					button.setButtonText("Downloading...");

					try {
						// 下载 compiler
						await downloadAndCacheWasm(
							WASM_CDN_URLS.compiler,
							"compiler",
							WASM_VERSION,
							storage,
							(loaded, total) => {
								const percent = (
									(loaded / total) *
									100
								).toFixed(0);
								button.setButtonText(`Compiler: ${percent}%`);
							}
						);

						// 下载 renderer
						await downloadAndCacheWasm(
							WASM_CDN_URLS.renderer,
							"renderer",
							WASM_VERSION,
							storage,
							(loaded, total) => {
								const percent = (
									(loaded / total) *
									100
								).toFixed(0);
								button.setButtonText(`Renderer: ${percent}%`);
							}
						);

						new Notice("Both WASM files downloaded successfully");
						await updateStatus();
					} catch (error) {
						new Notice(
							`Failed to download: ${
								error instanceof Error
									? error.message
									: String(error)
							}`
						);
					} finally {
						button.setDisabled(false);
						button.setButtonText("Download Both");
					}
				})
		);

	// 加载本地文件按钮
	new Setting(containerEl)
		.setName("Load from local files")
		.setDesc("Load WASM files from your computer")
		.addButton((button) =>
			button.setButtonText("Load Compiler").onClick(() => {
				const input = document.createElement("input");
				input.type = "file";
				input.accept = ".wasm";
				input.onchange = async () => {
					const file = input.files?.[0];
					if (!file) {
						return;
					}

					try {
						await loadLocalWasmFile(
							file,
							"compiler",
							WASM_VERSION,
							storage
						);
						new Notice("Compiler WASM loaded successfully");
						await updateStatus();
					} catch (error) {
						new Notice(
							`Failed to load: ${
								error instanceof Error
									? error.message
									: String(error)
							}`
						);
					}
				};
				input.click();
			})
		)
		.addButton((button) =>
			button.setButtonText("Load Renderer").onClick(() => {
				const input = document.createElement("input");
				input.type = "file";
				input.accept = ".wasm";
				input.onchange = async () => {
					const file = input.files?.[0];
					if (!file) {
						return;
					}

					try {
						await loadLocalWasmFile(
							file,
							"renderer",
							WASM_VERSION,
							storage
						);
						new Notice("Renderer WASM loaded successfully");
						await updateStatus();
					} catch (error) {
						new Notice(
							`Failed to load: ${
								error instanceof Error
									? error.message
									: String(error)
							}`
						);
					}
				};
				input.click();
			})
		);

	// 清除缓存按钮
	new Setting(containerEl)
		.setName("Clear WASM cache")
		.setDesc("Remove all cached WASM files from IndexedDB")
		.addButton((button) =>
			button
				.setButtonText("Clear All")
				.setWarning()
				.onClick(async () => {
					try {
						await storage.clearAll();
						new Notice("WASM cache cleared");
						await updateStatus();
					} catch (error) {
						new Notice(
							`Failed to clear cache: ${
								error instanceof Error
									? error.message
									: String(error)
							}`
						);
					}
				})
		);
}

import {
	App,
	DropdownComponent,
	Modal,
	Notice,
	Platform,
	Setting,
	TextAreaComponent,
	TextComponent,
	ButtonComponent,
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
	customPath?: string
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

interface ScriptNameModalOptions {
	title: string;
	placeholder: string;
	submitText: string;
	onSubmit: (name: string) => Promise<void>;
}

class ScriptNameModal extends Modal {
	constructor(app: App, private readonly options: ScriptNameModalOptions) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();

		new Setting(contentEl).setHeading().setName(this.options.title);

		let nameInput: TextComponent | null = null;
		new Setting(contentEl)
			.setName("New script name")
			.setDesc("Enter the name only, no .js suffix required")
			.addText((text) => {
				nameInput = text;
				text.setPlaceholder(this.options.placeholder);
			});

		const buttons = contentEl.createDiv({ cls: "modal-button-container" });
		const cancelButton = buttons.createEl("button", { text: "Cancel" });
		cancelButton.addEventListener("click", () => this.close());

		const submitButton = buttons.createEl("button", {
			text: this.options.submitText,
			cls: "mod-cta",
		});
		submitButton.addEventListener("click", async () => {
			const rawName = nameInput?.getValue() ?? "";
			const sanitizedName = rawName.replace(/[\\\/]/g, "").trim();
			if (!sanitizedName) {
				new Notice("Script name cannot be empty");
				return;
			}

			try {
				await this.options.onSubmit(sanitizedName);
				this.close();
			} catch (error) {
				const message =
					error instanceof Error ? error.message : String(error);
				new Notice(message);
			}
		});
	}
}

interface ScriptEditorModalOptions {
	mode: "create" | "edit";
	scriptName?: string;
	initialContent: string;
	onSubmit: (name: string, content: string) => Promise<void>;
	contentType?: "script" | "template"; // Distinguish between scripts and templates
}

class ScriptEditorModal extends Modal {
	constructor(app: App, private readonly options: ScriptEditorModalOptions) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("typst-script-editor-modal");

		const contentType = this.options.contentType || "script";
		const displayType = contentType === "template" ? "Template" : "Script";
		const title =
			this.options.mode === "create"
				? `Create Typst ${displayType}`
				: `Edit ${displayType}: ${this.options.scriptName}`;
		new Setting(contentEl).setHeading().setName(title);

		let nameInput: TextComponent | null = null;
		if (this.options.mode === "create") {
			const contentType = this.options.contentType || "script";
			const displayType = contentType === "template" ? "template" : "script";
			const suffix = contentType === "template" ? ".typ" : ".js";
			new Setting(contentEl)
				.setName(`${displayType.charAt(0).toUpperCase() + displayType.slice(1)} name`)
				.setDesc(`Enter the name only, no ${suffix} suffix required`)
				.addText((text) => {
					nameInput = text;
					text.setPlaceholder("report").setValue(
						this.options.scriptName ?? ""
					);
				});
		} else {
			const contentType = this.options.contentType || "script";
			const displayType = contentType === "template" ? "template" : "script";
			contentEl.createEl("p", {
				text: `Current ${displayType}: ${this.options.scriptName}`,
			});
		}

		const editor = new TextAreaComponent(contentEl);
		editor.inputEl.rows = 18;
		editor.inputEl.spellcheck = false;
		editor.inputEl.toggleClass("script-editor-modal-textarea", true);
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
			const contentType = this.options.contentType || "script";
			const displayType = contentType === "template" ? "Template" : "Script";
			if (!sanitizedName) {
				new Notice(`${displayType} name cannot be empty`);
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

/**
 * Conversion Preview Modal - Shows live preview of template + script transformation
 */
class ConversionPreviewModal extends Modal {
	private markdownInput: TextAreaComponent;
	private outputArea: TextAreaComponent;
	private templateDropdown: DropdownComponent;
	private scriptDropdown: DropdownComponent;
	private previewButton: ButtonComponent;

	constructor(
		app: App,
		private plugin: BonWorkflow,
		private sampleMarkdown: string = "# Sample Document\n\nThis is a **preview** of how your template and script will transform Markdown to Typst.\n\n## Features\n\n- Bullet points\n- More content\n"
	) {
		super(app);
	}

	async onOpen(): Promise<void> {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("typst-conversion-preview-modal");

		new Setting(contentEl)
			.setHeading()
			.setName("Conversion Preview")
			.setDesc(
				"Test how your template and script transform Markdown to Typst"
			);

		// Input area
		new Setting(contentEl)
			.setName("Sample Markdown")
			.setDesc("Edit this to test different content");
		this.markdownInput = new TextAreaComponent(contentEl);
		this.markdownInput.inputEl.rows = 8;
		this.markdownInput.setValue(this.sampleMarkdown);
		this.markdownInput.inputEl.toggleClass(
			"conversion-preview-markdown-textarea",
			true
		);

		// Configuration section
		const configDiv = contentEl.createDiv({
			cls: "conversion-preview-config",
		});

		// Template selection
		const templateSetting = new Setting(configDiv).setName("Template");
		templateSetting.addDropdown((dropdown) => {
			this.templateDropdown = dropdown;
			dropdown.addOption("", "No template");
		});

		// Script selection
		const scriptSetting = new Setting(configDiv).setName("Script");
		scriptSetting.addDropdown((dropdown) => {
			this.scriptDropdown = dropdown;
			dropdown.addOption("", "AST only (no script)");
		});

		// Preview button
		const buttonSetting = new Setting(configDiv);
		buttonSetting.addButton((btn) => {
			this.previewButton = btn;
			btn.setButtonText("Preview")
				.setCta()
				.onClick(async () => {
					await this.updatePreview();
				});
		});

		// Output area (read-only)
		new Setting(contentEl)
			.setName("Typst Output")
			.setDesc("Final Typst code after template + script transformation");
		this.outputArea = new TextAreaComponent(contentEl);
		this.outputArea.inputEl.rows = 15;
		this.outputArea.inputEl.readOnly = true;
		this.outputArea.inputEl.toggleClass(
			"conversion-preview-output-textarea",
			true
		);

		// Load templates and scripts
		await this.loadOptions();

		// Initial preview
		await this.updatePreview();
	}

	private async loadOptions(): Promise<void> {
		const converter = this.plugin.getTypstConverter();
		if (!converter) {
			return;
		}

		const templateManager = converter.getTemplateManager();
		const scriptManager = this.plugin.getTypstScriptManager();

		// Load templates
		if (templateManager) {
			try {
				const templates = await templateManager.listTemplates();
				const settings = this.plugin.settings.typst;

				// Clear and rebuild template options
				this.templateDropdown.selectEl.empty();
				const noTemplateOpt = document.createElement("option");
				noTemplateOpt.value = "";
				noTemplateOpt.textContent = "No template";
				this.templateDropdown.selectEl.appendChild(noTemplateOpt);

				templates.forEach((name) => {
					const option = document.createElement("option");
					option.value = name;
					option.textContent =
						name === "default" ? `${name} (built-in)` : name;
					this.templateDropdown.selectEl.appendChild(option);
				});

				// Set default
				if (
					settings.defaultTemplateName &&
					templates.includes(settings.defaultTemplateName)
				) {
					this.templateDropdown.setValue(
						settings.defaultTemplateName
					);
				}
			} catch (error) {
				console.error("Failed to load templates:", error);
			}
		}

		// Load scripts
		if (scriptManager) {
			try {
				const scripts = await scriptManager.listScripts();
				const settings = this.plugin.settings.typst;

				// Clear and rebuild script options
				this.scriptDropdown.selectEl.empty();
				const astOnlyOpt = document.createElement("option");
				astOnlyOpt.value = "";
				astOnlyOpt.textContent = "AST only (no script)";
				this.scriptDropdown.selectEl.appendChild(astOnlyOpt);

				scripts.forEach((name) => {
					const option = document.createElement("option");
					option.value = name;
					option.textContent =
						name === "default" ? `${name} (built-in)` : name;
					this.scriptDropdown.selectEl.appendChild(option);
				});

				// Set default
				if (
					settings.defaultScriptName &&
					scripts.includes(settings.defaultScriptName)
				) {
					this.scriptDropdown.setValue(settings.defaultScriptName);
				}
			} catch (error) {
				console.error("Failed to load scripts:", error);
			}
		}
	}

	private async updatePreview(): Promise<void> {
		try {
			this.previewButton.setButtonText("Previewing...");
			this.previewButton.setDisabled(true);

			const converter = this.plugin.getTypstConverter();
			if (!converter) {
				this.outputArea.setValue(
					"Error: Typst converter not initialized"
				);
				return;
			}

			const markdown = this.markdownInput.getValue();
			const templateName = this.templateDropdown.getValue() || undefined;
			const scriptName = this.scriptDropdown.getValue() || "default";
			const transformMode = this.scriptDropdown.getValue()
				? "script"
				: "ast";

			const result = await converter.convertMarkdown(markdown, {
				transformMode,
				scriptName,
				templateName,
				maxEmbedDepth: 5,
			});

			this.outputArea.setValue(result);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : String(error);
			this.outputArea.setValue(`Error during conversion:\n\n${message}`);
		} finally {
			this.previewButton.setButtonText("Preview");
			this.previewButton.setDisabled(false);
		}
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

async function refreshTemplateOptions(
	dropdown: DropdownComponent,
	manager: import("./typstTemplateManager").TypstTemplateManager | null
): Promise<string[]> {
	if (!manager) {
		dropdown.setDisabled(true);
		return [];
	}

	const templates = await manager.listTemplates();
	const selectEl = dropdown.selectEl;
	while (selectEl.firstChild) {
		selectEl.removeChild(selectEl.firstChild);
	}

	if (!templates.length) {
		const option = document.createElement("option");
		option.value = "";
		option.textContent = "No templates available";
		selectEl.appendChild(option);
		dropdown.setDisabled(true);
		return [];
	}

	templates.forEach((template) => {
		const option = document.createElement("option");
		option.value = template;
		option.textContent = template;
		selectEl.appendChild(option);
	});
	dropdown.setDisabled(false);
	if (!templates.includes(dropdown.getValue())) {
		dropdown.setValue(templates[0]);
	}
	return templates;
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

	// 验证格式兼容性：WASM 模式下只能使用 SVG
	if (
		typstSettings.previewMode === "wasm" &&
		typstSettings.compileFormat !== "svg"
	) {
		typstSettings.compileFormat = "svg";
		void plugin.saveSettings(); // 静默保存
		console.log(
			"[Typst Settings] Auto-corrected compile format to SVG for WASM mode"
		);
	}

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
		.setName("Show notice on auto compile")
		.setDesc(
			"Display success notification with action buttons when auto-compile completes. If disabled, auto-compile runs silently (recommended to avoid frequent interruptions)."
		)
		.addToggle((toggle) =>
			toggle
				.setValue(typstSettings.showNoticeOnAutoCompile)
				.onChange(async (value) => {
					typstSettings.showNoticeOnAutoCompile = value;
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

	new Setting(section)
		.setName("Enhanced checkbox support")
		.setDesc(
			"Enable 24+ checkbox styles with @preview/cheq package.\n" +
				"⚠️ When enabled: Requires CLI compilation (slower, full features).\n" +
				"When disabled: Uses basic GFM checkboxes (WASM compatible, faster)."
		)
		.addToggle((toggle) =>
			toggle
				.setValue(typstSettings.enableCheckboxEnhancement ?? true)
				.onChange(async (value) => {
					typstSettings.enableCheckboxEnhancement = value;
					await plugin.saveSettings();
					new Notice(
						value
							? "Enhanced checkbox enabled. Using CLI for full features."
							: "Enhanced checkbox disabled. Using WASM for faster rendering."
					);
				})
		);

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
				typstSettings.typstCliPath
			);

			if (cliInfo.installed) {
				const methodLabel =
					{
						custom: "Custom Path",
						system: "System PATH",
						detected: "Auto-detected",
					}[cliInfo.method || "unknown"] || "Unknown";

				cliStatusSetting.setDesc(
					`✅ ${methodLabel}: ${cliInfo.path}\n📦 Version: ${
						cliInfo.version || "unknown"
					}`
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
					getPathExamples()
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
								`✅ Valid Typst CLI\nPath: ${result.path}\nVersion: ${result.version}`
							);
						} else {
							new Notice(
								`❌ Invalid path: ${testPath}\n${
									result.error || "Command not found"
								}`
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
					"ℹ️ WASM mode doesn't support external packages but works offline."
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
					const oldMode = typstSettings.previewMode;
					typstSettings.previewMode = value as TypstPreviewMode;

					// WASM 模式下自动切换到 SVG 格式
					if (
						value === "wasm" &&
						typstSettings.compileFormat !== "svg"
					) {
						typstSettings.compileFormat = "svg";
						new Notice(
							`Preview mode set to: ${value}\nCompile format auto-switched to SVG (WASM only supports SVG)`
						);
					} else {
						new Notice(`Preview mode set to: ${value}`);
					}

					await plugin.saveSettings();
					// 刷新设置页面以更新格式选项的可用状态
					settingTab.display();
				});
		});

	// 编译输出格式
	const isWasmMode = typstSettings.previewMode === "wasm";
	new Setting(section)
		.setName("Compile format")
		.setDesc(
			isWasmMode
				? "⚠️ WASM mode only supports SVG output. Switch to CLI mode for PDF/PNG."
				: "Output format when using CLI compilation. SVG: Vector (best for preview). PNG: Raster image. PDF: Document."
		)
		.addDropdown((dropdown) => {
			// WASM 模式下只显示 SVG 选项
			if (isWasmMode) {
				dropdown.addOption("svg", "SVG (Vector) - WASM Only");
			} else {
				// CLI 模式下显示所有选项
				dropdown.addOption("svg", "SVG (Vector)");
				dropdown.addOption("png", "PNG (Image)");
				dropdown.addOption("pdf", "PDF (Document)");
			}

			dropdown
				.setValue(typstSettings.compileFormat ?? "svg")
				.setDisabled(isWasmMode) // WASM 模式下禁用选择
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

	// === 文件路径配置 ===
	new Setting(section).setHeading().setName("File path configuration");

	// .typ 文件存储模式
	new Setting(section)
		.setName("Intermediate .typ file storage")
		.setDesc("Choose where to store intermediate .typ files")
		.addDropdown((dropdown) => {
			dropdown.addOption(
				"same-dir",
				"Same directory as source (default)"
			);
			dropdown.addOption("unified", "Unified directory (.typst-temp)");
			dropdown.addOption("custom", "Custom directory");
			dropdown
				.setValue(typstSettings.typFileStorageMode || "same-dir")
				.onChange(async (value) => {
					typstSettings.typFileStorageMode = value as any;
					await plugin.saveSettings();
					settingTab.display(); // 刷新UI显示自定义目录输入框
				});
		});

	// 自定义 .typ 目录（仅在 unified/custom 模式显示）
	if (typstSettings.typFileStorageMode !== "same-dir") {
		new Setting(section)
			.setName(".typ file directory")
			.setDesc("Vault-relative path for storing .typ files")
			.addText((text) => {
				text.setPlaceholder(".typst-temp")
					.setValue(typstSettings.typFileDirectory || ".typst-temp")
					.onChange(async (value) => {
						typstSettings.typFileDirectory =
							value.trim() || ".typst-temp";
						await plugin.saveSettings();
					});
			});
	}

	// 输出文件目录
	new Setting(section)
		.setName("Output file directory (optional)")
		.setDesc("Leave empty to output in the same directory as source file")
		.addText((text) => {
			text.setPlaceholder("exports/typst")
				.setValue(typstSettings.outputDirectory || "")
				.onChange(async (value) => {
					typstSettings.outputDirectory = value.trim() || undefined;
					await plugin.saveSettings();
				});
		});

	// 输出文件命名优先级
	new Setting(section)
		.setName("Output filename source priority")
		.setDesc(
			"Priority order for determining output filename:\n" +
				"1. Frontmatter (typst-output-name)\n" +
				"2. Folder name\n" +
				"3. File name (default)"
		)
		.addDropdown((dropdown) => {
			dropdown.addOption(
				"frontmatter,folder,filename",
				"Frontmatter > Folder > Filename"
			);
			dropdown.addOption(
				"frontmatter,filename,folder",
				"Frontmatter > Filename > Folder"
			);
			dropdown.addOption(
				"folder,filename,frontmatter",
				"Folder > Filename > Frontmatter"
			);
			dropdown.addOption(
				"filename,folder,frontmatter",
				"Filename > Folder > Frontmatter"
			);

			const current = typstSettings.outputNamingPriority.join(",");
			dropdown.setValue(current).onChange(async (value) => {
				typstSettings.outputNamingPriority = value.split(",") as any;
				await plugin.saveSettings();
			});
		});

	// 时间戳选项
	new Setting(section)
		.setName("Append timestamp to output filename")
		.setDesc("Add timestamp (YYYYMMDD-HHmmss) to avoid filename conflicts")
		.addToggle((toggle) =>
			toggle
				.setValue(typstSettings.outputAppendTimestamp || false)
				.onChange(async (value) => {
					typstSettings.outputAppendTimestamp = value;
					await plugin.saveSettings();
				})
		);

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

	// Default script selector
	new Setting(section)
		.setName("Default script")
		.setDesc(
			'Script used when no folder mapping or frontmatter specified. "default" is a read-only template.'
		)
		.addDropdown(async (dropdown) => {
			dropdown.setDisabled(!manager);
			if (manager) {
				const scripts = await manager.listScripts();
				scripts.forEach((name) => {
					dropdown.addOption(
						name,
						name === "default" ? `${name} (template)` : name
					);
				});
				dropdown
					.setValue(typstSettings.defaultScriptName || "default")
					.onChange(async (value) => {
						typstSettings.defaultScriptName = value;
						await plugin.saveSettings();
						new Notice(`Default script set to: ${value}`);
					});
			}
		});

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
						// Refresh settings page to update default script dropdown
						settingTab.display();
					},
				}).open();
			})
	);

	scriptSetting.addButton((button) =>
		button
			.setButtonText("Copy")
			.setDisabled(!manager)
			.onClick(async () => {
				if (!manager || !dropdown) {
					return;
				}
				const scriptName = dropdown.getValue();
				if (!scriptName) {
					new Notice("Please select a script to copy");
					return;
				}

				// Prompt for new name
				new ScriptNameModal(plugin.app, {
					title: `Copy script "${scriptName}"`,
					placeholder: "Enter new script name",
					submitText: "Copy",
					onSubmit: async (newName) => {
						try {
							await manager.copyScript(scriptName, newName);
							new Notice(`Script copied to: ${newName}`);
							cachedScripts = await refreshScriptOptions(
								dropdown!,
								manager
							);
							dropdown.setValue(newName);
							// Refresh settings page to update default script dropdown
							settingTab.display();
						} catch (error) {
							const message =
								error instanceof Error
									? error.message
									: String(error);
							new Notice(`Copy failed: ${message}`);
						}
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

				// "default" script is read-only
				if (scriptName === "default") {
					new Notice(
						'The "default" template script is read-only. Use Copy to create an editable version.'
					);
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
					// Pass the user's default script name for protection
					await manager.deleteScript(
						scriptName,
						typstSettings.defaultScriptName
					);
					new Notice(`Script ${scriptName} deleted`);
					cachedScripts = await refreshScriptOptions(
						dropdown!,
						manager
					);
					if (cachedScripts.length === 0) {
						dropdown.setValue("");
					}
					// Refresh the entire settings page to update the default script dropdown
					settingTab.display();
				} catch (error) {
					const message =
						error instanceof Error ? error.message : String(error);
					new Notice(message);
				}
			})
	);

	// ===== Template Management =====
	// Reuse the converter variable defined at the top of renderTypstSettings
	const templateManager = converter?.getTemplateManager();

	new Setting(section).setHeading().setName("Template management");

	// Enable template system toggle
	new Setting(section)
		.setName("Enable template system")
		.setDesc(
			"Apply Typst templates before content. Templates are .typ files that define document formatting."
		)
		.addToggle((toggle) =>
			toggle
				.setValue(typstSettings.enableTemplateSystem ?? true)
				.onChange(async (value) => {
					typstSettings.enableTemplateSystem = value;
					await plugin.saveSettings();
					settingTab.display(); // Refresh to show/hide template options
				})
		);

	if (!typstSettings.enableTemplateSystem) {
		new Setting(section)
			.setName("Template system disabled")
			.setDesc("Enable template system above to manage templates");
		return; // Don't show template management when disabled
	}

	// Template directory configuration
	let pendingTemplateDirectory =
		typstSettings.templateDirectory || "typst-templates";
	new Setting(section)
		.setName("Template directory")
		.setDesc("Vault-relative path for storing Typst templates")
		.addText((text) => {
			text.setPlaceholder("typst-templates")
				.setValue(typstSettings.templateDirectory || "typst-templates")
				.onChange((value) => {
					pendingTemplateDirectory =
						value.trim() || "typst-templates";
				});
			text.inputEl.addEventListener("blur", async () => {
				if (
					pendingTemplateDirectory === typstSettings.templateDirectory
				) {
					return;
				}
				typstSettings.templateDirectory = pendingTemplateDirectory;
				await plugin.saveSettings();
				await plugin.refreshTypstFeatures();
				new Notice("Typst template directory updated");
			});
			text.inputEl.addEventListener("keydown", (event) => {
				if (event.key === "Enter") {
					event.preventDefault();
					text.inputEl.blur();
				}
			});
		});

	// Default template selector
	new Setting(section)
		.setName("Default template")
		.setDesc(
			'Template used when no folder mapping or frontmatter specified. "default" is a read-only template.'
		)
		.addDropdown(async (dropdown) => {
			dropdown.setDisabled(!templateManager);
			if (templateManager) {
				const templates = await templateManager.listTemplates();
				templates.forEach((name) => {
					dropdown.addOption(
						name,
						name === "default" ? `${name} (built-in)` : name
					);
				});
				dropdown
					.setValue(typstSettings.defaultTemplateName || "default")
					.onChange(async (value) => {
						typstSettings.defaultTemplateName = value;
						await plugin.saveSettings();
						new Notice(`Default template set to: ${value}`);
					});
			}
		});

	// Template list management
	const templateSetting = new Setting(section)
		.setName("Template list")
		.setDesc("Manage Typst templates (.typ files)");

	let templateDropdown: DropdownComponent | null = null;
	templateSetting.addDropdown((drop) => {
		templateDropdown = drop;
		drop.setDisabled(!templateManager);
	});

	let cachedTemplates: string[] = [];
	if (templateManager && templateDropdown) {
		void (async () => {
			cachedTemplates = await refreshTemplateOptions(
				templateDropdown!,
				templateManager
			);
		})();
	} else {
		templateSetting.setDesc("Template manager is not initialized");
	}

	// Create button
	templateSetting.addButton((button) =>
		button
			.setButtonText("Create")
			.setCta()
			.setDisabled(!templateManager)
			.onClick(() => {
				if (!templateManager || !templateDropdown) {
					return;
				}
				new ScriptEditorModal(plugin.app, {
					mode: "create",
					contentType: "template",
					initialContent:
						'// Your Typst template\n\n#set page(paper: "a4")\n#set text(size: 11pt)\n\n',
					onSubmit: async (name, content) => {
						await templateManager.saveTemplate(name, content);
						new Notice(`Template ${name} created`);
						cachedTemplates = await refreshTemplateOptions(
							templateDropdown!,
							templateManager
						);
						settingTab.display();
					},
				}).open();
			})
	);

	// Copy button
	templateSetting.addButton((button) =>
		button
			.setButtonText("Copy")
			.setDisabled(!templateManager)
			.onClick(async () => {
				if (!templateManager || !templateDropdown) {
					return;
				}
				const templateName = templateDropdown.getValue();
				if (!templateName) {
					new Notice("Please select a template to copy");
					return;
				}

				new ScriptNameModal(plugin.app, {
					title: `Copy template "${templateName}"`,
					placeholder: "Enter new template name",
					submitText: "Copy",
					onSubmit: async (newName) => {
						try {
							await templateManager.copyTemplate(
								templateName,
								newName
							);
							new Notice(`Template copied to: ${newName}`);
							cachedTemplates = await refreshTemplateOptions(
								templateDropdown!,
								templateManager
							);
							templateDropdown.setValue(newName);
							settingTab.display();
						} catch (error) {
							const message =
								error instanceof Error
									? error.message
									: String(error);
							new Notice(`Copy failed: ${message}`);
						}
					},
				}).open();
			})
	);

	// Edit button
	templateSetting.addButton((button) =>
		button
			.setButtonText("Edit")
			.setDisabled(!templateManager)
			.onClick(async () => {
				if (!templateManager || !templateDropdown) {
					return;
				}
				const templateName = templateDropdown.getValue();
				if (!templateName) {
					new Notice("Please select a template to edit");
					return;
				}

				if (templateName === "default") {
					new Notice(
						'The "default" template is read-only. Use Copy to create an editable version.'
					);
					return;
				}

				const content = await templateManager.loadTemplate(
					templateName
				);
				new ScriptEditorModal(plugin.app, {
					mode: "edit",
					contentType: "template",
					scriptName: templateName,
					initialContent: content,
					onSubmit: async (_name, updated) => {
						await templateManager.saveTemplate(
							templateName,
							updated
						);
						new Notice(`Template ${templateName} updated`);
					},
				}).open();
			})
	);

	// Delete button
	templateSetting.addButton((button) =>
		button
			.setButtonText("Delete")
			.setDisabled(!templateManager)
			.onClick(async () => {
				if (!templateManager || !templateDropdown) {
					return;
				}
				const templateName = templateDropdown.getValue();
				if (!templateName) {
					new Notice("Please select a template to delete");
					return;
				}
				try {
					await templateManager.deleteTemplate(
						templateName,
						typstSettings.defaultTemplateName
					);
					new Notice(`Template ${templateName} deleted`);
					cachedTemplates = await refreshTemplateOptions(
						templateDropdown!,
						templateManager
					);
					if (cachedTemplates.length === 0) {
						templateDropdown.setValue("");
					}
					settingTab.display();
				} catch (error) {
					const message =
						error instanceof Error ? error.message : String(error);
					new Notice(message);
				}
			})
	);

	// ===== Conversion Preview =====
	new Setting(section)
		.setName("Preview conversion")
		.setDesc(
			"Test how your template and script transform Markdown to Typst"
		)
		.addButton((btn) => {
			btn.setButtonText("Open Preview")
				.setCta()
				.onClick(() => {
					new ConversionPreviewModal(plugin.app, plugin).open();
				});
		});
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

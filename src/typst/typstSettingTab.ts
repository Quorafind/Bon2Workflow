import {
	App,
	DropdownComponent,
	Modal,
	Notice,
	Setting,
	TextAreaComponent,
	TextComponent,
} from "obsidian";
import type BonWorkflow from "../main";
import { DEFAULT_SCRIPT_CONTENT } from "./typstScriptManager";
import type { TypstScriptManager } from "./typstScriptManager";
import type { TypstSettings } from "./typstSettings";

interface ScriptEditorModalOptions {
	mode: "create" | "edit";
	scriptName?: string;
	initialContent: string;
	onSubmit: (name: string, content: string) => Promise<void>;
}

class ScriptEditorModal extends Modal {
	constructor(
		app: App,
		private readonly options: ScriptEditorModalOptions
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();

		const title =
			this.options.mode === "create"
				? "新建 Typst 脚本"
				: `编辑脚本：${this.options.scriptName}`;
		contentEl.createEl("h2", { text: title });

		let nameInput: TextComponent | null = null;
		if (this.options.mode === "create") {
			new Setting(contentEl)
				.setName("脚本名称")
				.setDesc("仅输入名称，无需 .js 后缀")
				.addText((text) => {
					nameInput = text;
					text.setPlaceholder("report").setValue(
						this.options.scriptName ?? ""
					);
				});
		} else {
			contentEl.createEl("p", {
				text: `当前脚本：${this.options.scriptName}`,
			});
		}

		const editor = new TextAreaComponent(contentEl);
		editor.inputEl.rows = 18;
		editor.inputEl.spellcheck = false;
		editor
			.setPlaceholder("function transform(content) { return content; }")
			.setValue(this.options.initialContent);

		const buttons = contentEl.createDiv({ cls: "modal-button-container" });
		const cancelButton = buttons.createEl("button", { text: "取消" });
		cancelButton.addEventListener("click", () => this.close());

		const submitButton = buttons.createEl("button", {
			text: "保存",
			cls: "mod-cta",
		});
		submitButton.addEventListener("click", async () => {
			const rawName =
				this.options.mode === "create"
					? nameInput?.getValue() ?? ""
					: this.options.scriptName ?? "";
			const sanitizedName = rawName.replace(/[\\\/]/g, "").trim();
			if (!sanitizedName) {
				new Notice("脚本名称不能为空");
				return;
			}

			try {
				await this.options.onSubmit(
					sanitizedName,
					editor.getValue()
				);
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
		option.textContent = "暂无脚本";
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
	plugin: BonWorkflow
) {
	const typstSettings = plugin.settings.typst as TypstSettings | undefined;
	const manager = plugin.getTypstScriptManager();

	const section = containerEl.createDiv({ cls: "typst-settings" });
	section.createEl("h3", { text: "Typst Workflow Settings" });

	if (!typstSettings) {
		section.createEl("p", {
			text: "Typst 设置未初始化，请稍后重试。",
		});
		return;
	}

	new Setting(section)
		.setName("触发标签")
		.setDesc("frontmatter 中包含任一标签时会触发 Typst 转换")
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
		.setName("自动编译 Typst")
		.setDesc("转换完成后自动运行 typst compile（需安装 Typst CLI）")
		.addToggle((toggle) =>
			toggle
				.setValue(typstSettings.autoCompile)
				.onChange(async (value) => {
					typstSettings.autoCompile = value;
					await plugin.saveSettings();
				})
		);

	let pendingDirectory = typstSettings.scriptDirectory;
	new Setting(section)
		.setName("脚本目录")
		.setDesc("Vault 相对路径，用于存放 Typst 转换脚本")
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
				new Notice("Typst 脚本目录已更新");
			});
			text.inputEl.addEventListener("keydown", (event) => {
				if (event.key === "Enter") {
					event.preventDefault();
					text.inputEl.blur();
				}
			});
		});

	section.createEl("h4", { text: "脚本管理" });
	const scriptSetting = new Setting(section)
		.setName("脚本列表")
		.setDesc("管理 Typst 转换脚本");

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
		scriptSetting.setDesc("脚本管理器尚未初始化");
	}

	scriptSetting.addButton((button) =>
		button
			.setButtonText("新建")
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
						new Notice(`脚本 ${name} 已创建`);
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
			.setButtonText("编辑")
			.setDisabled(!manager)
			.onClick(async () => {
				if (!manager || !dropdown) {
					return;
				}
				const scriptName = dropdown.getValue();
				if (!scriptName) {
					new Notice("请选择要编辑的脚本");
					return;
				}
				const content = await manager.loadScript(scriptName);
				new ScriptEditorModal(plugin.app, {
					mode: "edit",
					scriptName,
					initialContent: content,
					onSubmit: async (_name, updated) => {
						await manager.saveScript(scriptName, updated);
						new Notice(`脚本 ${scriptName} 已更新`);
					},
				}).open();
			})
	);

	scriptSetting.addButton((button) =>
		button
			.setButtonText("删除")
			.setDisabled(!manager)
			.onClick(async () => {
				if (!manager || !dropdown) {
					return;
				}
				const scriptName = dropdown.getValue();
				if (!scriptName) {
					new Notice("请选择要删除的脚本");
					return;
				}
				try {
					await manager.deleteScript(scriptName);
					new Notice(`脚本 ${scriptName} 已删除`);
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

import { App, PluginSettingTab, Setting } from "obsidian";
import type BonWorkflow from "./main";
import { renderTypstSettings } from "./typst/typstSettingTab";

export class BonWorkflowSettingTab extends PluginSettingTab {
	plugin: BonWorkflow;

	constructor(app: App, plugin: BonWorkflow) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl).setHeading().setName("Bon workflow");

		new Setting(containerEl)
			.setName("Enable Count")
			.setDesc(
				"Enable character count and status bar, this is a toy feature but it's enough for me to monitor my daily writing."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableCount)
					.onChange(async (value) => {
						this.plugin.settings.enableCount = value;
						await this.plugin.saveSettings();

						// Apply changes immediately
						if (value) {
							this.plugin.loadStatusBar();
						} else {
							this.plugin.unloadStatusBar();
						}
					})
			);

		new Setting(containerEl)
			.setName("Folder Check")
			.setDesc(
				"Sometimes I want to mark some folder as done (I use project folder with Task Genius), and this feature is for me to mark the folder as done."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.folderCheck.enabled)
					.onChange(async (value) => {
						this.plugin.settings.folderCheck.enabled = value;
						await this.plugin.saveSettings();
					})
			);

		if (this.plugin.settings.folderCheck.enabled) {
			new Setting(containerEl)
				.setName("Target File")
				.setDesc(
					"All folder match checkbox item in this file will be marked, for example in-progress/todo/done "
				)
				.addText((text) =>
					text
						.setPlaceholder("TODO.md")
						.setValue(this.plugin.settings.folderCheck.targetPath)
						.onChange(async (value) => {
							this.plugin.settings.folderCheck.targetPath = value;
							await this.plugin.saveSettings();
						})
				);
		}

		renderTypstSettings(containerEl, this.plugin, this);
	}
}

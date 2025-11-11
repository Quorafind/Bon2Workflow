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
			.setDesc("Enable character count and status bar")
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

		renderTypstSettings(containerEl, this.plugin, this);
	}
}

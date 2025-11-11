import { Component, debounce, Menu, setIcon } from "obsidian";
import type { bon2workflowSettings } from "./settings";
import type BonWorkflow from "./main";

export class CustomStatusBar extends Component {
	private containerEl: HTMLElement;
	private counts: InputCounts = {
		characters: 0,
		punctuation: 0,
		pasteCount: 0,
		dropCount: 0,
		compositionLength: 0,
		compositionStartPos: 0,
		compositionEndPos: 0,
	};

	private countEl: HTMLElement;
	private dailyCountEl: HTMLElement;
	private plugin: BonWorkflow;
	private cachedHistoricalTotal = 0;
	private lastCalculatedDate = "";

	constructor(
		containerEl: HTMLElement,
		readonly config: CountConfig,
		plugin: BonWorkflow
	) {
		super();
		this.containerEl = containerEl;
		this.plugin = plugin;
	}

	debounceSaveSettings = debounce(() => {
		this.plugin.saveSettings();
	}, 1000);

	private calculateHistoricalTotal(excludeDate: string) {
		return Object.entries(this.plugin.settings.historyChars)
			.filter(([date]) => date !== excludeDate)
			.reduce((sum, [_, count]) => sum + count, 0);
	}

	onload() {
		this.containerEl.toggleClass("bon2workflow-status-bar", true);
		this.containerEl.createSpan("bon2workflow-status-bar-item", (el) => {
			setIcon(el, "square");
		});

		const today = new Date().toISOString().split("T")[0];
		if (!this.plugin.settings.historyChars[today]) {
			this.plugin.settings.historyChars[today] = 0;
		}

		// Calculate historical total excluding today
		this.cachedHistoricalTotal = this.calculateHistoricalTotal(today);
		this.lastCalculatedDate = today;

		const totalChars =
			this.cachedHistoricalTotal +
			this.plugin.settings.historyChars[today];

		this.countEl = this.containerEl.createEl("span", {
			text: `Total: ${totalChars}`,
			title: `Total characters: ${totalChars}`,
		});

		this.containerEl.createSpan(
			"bon2workflow-status-bar-separator",
			(el) => {
				el.textContent = " | ";
			}
		);

		this.dailyCountEl = this.containerEl.createEl("span", {
			text: `Today: ${this.plugin.settings.historyChars[today]}`,
			title: `Characters today: ${this.plugin.settings.historyChars[today]}`,
		});
	}

	onunload(): void {
		this.containerEl.empty();
	}

	async update(counts: InputCounts) {
		if (this.config.countChars) {
			const today = new Date().toISOString().split("T")[0];

			// Recalculate historical total if date changed
			if (today !== this.lastCalculatedDate) {
				this.cachedHistoricalTotal =
					this.calculateHistoricalTotal(today);
				this.lastCalculatedDate = today;
			}

			if (!this.plugin.settings.historyChars[today]) {
				this.plugin.settings.historyChars[today] = 0;
			}

			// Update history chars if current count is greater
			if (counts.characters > this.plugin.settings.historyChars[today]) {
				this.plugin.settings.historyChars[today] = counts.characters;
				this.debounceSaveSettings();
			}

			this.counts = counts;

			// Use cached historical total plus today's count
			const totalChars =
				this.cachedHistoricalTotal +
				this.plugin.settings.historyChars[today];

			// Update display
			this.countEl.textContent = `Total: ${totalChars}`;
			this.countEl.title = `Total characters: ${totalChars}`;
			this.dailyCountEl.textContent = `Today: ${this.plugin.settings.historyChars[today]}`;
			this.dailyCountEl.title = `Characters today: ${this.plugin.settings.historyChars[today]}`;
		}
	}

	getCounts() {
		return this.counts;
	}
}

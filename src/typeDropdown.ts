import { Component, Menu } from "obsidian";

export const supportedTypes = {
	abstract: { name: "Abstract", icon: "clipboard-list" },
	info: { name: "Info", icon: "info" },
	todo: { name: "Todo", icon: "check-circle-2" },
	tip: { name: "Tip", icon: "flame" },
	success: { name: "Success", icon: "check-circle" },
	question: { name: "Question", icon: "help-circle" },
	warning: { name: "Warning", icon: "alert-triangle" },
	failure: { name: "Failure", icon: "x" },
	danger: { name: "Danger", icon: "zap" },
	bug: { name: "Bug", icon: "bug" },
	quote: { name: "Quote", icon: "quote" },
	example: { name: "Example", icon: "list" },
	note: { name: "Note", icon: "pencil" },
} as const;

interface ContainerEl extends HTMLElement {
	cmView: {
		widget: {
			getType: () => keyof typeof supportedTypes;
			updateType: (type: keyof typeof supportedTypes) => void;
		};
	};
}

export class TypeDropdownComponent extends Component {
	private trigger: HTMLElement;
	private containerEl: ContainerEl;

	constructor(trigger: HTMLElement, containerEl: ContainerEl) {
		super();
		this.trigger = trigger;
		this.containerEl = containerEl;
	}

	async onload() {
		this.trigger.addClass("dropdown-trigger");

		this.registerDomEvent(
			this.trigger,
			"click",
			this.toggleMenu.bind(this)
		);
	}

	private toggleMenu(event: MouseEvent) {
		event.stopPropagation();

		if (!this.containerEl.cmView) {
			return;
		}

		const menu = new Menu();
		for (const [type, info] of Object.entries(supportedTypes)) {
			menu.addItem((item) => {
				item.setIcon(info.icon);
				item.setTitle(info.name);
				item.setChecked(
					type ===
						this.containerEl.cmView.widget.getType().toLowerCase()
				);
				item.onClick(() => {
					this.containerEl.cmView.widget.updateType(
						type as keyof typeof supportedTypes
					);
				});
			});
		}

		menu.showAtMouseEvent(event);
	}
}

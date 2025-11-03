import {
	type Menu,
	Plugin,
	type TAbstractFile,
	TFolder,
	type WorkspaceLeaf,
	type TFile,
	type CachedMetadata,
} from "obsidian";
import {
	type FolderTaskItem,
	handleCallouts,
	handleTaskChanges,
	updateFileExplorerCheckboxes,
} from "./utils";
import { inputCounter } from "./editor/countInput";
import { CustomStatusBar } from "./statusbar";
import { BONBON_SETTINGS, type BonbonSettings } from "./settings";
// import { VIEW_TYPE } from "./view";
import { renderSubscription } from "./Subscription";
import { BonWorkflowSettingTab } from "./settingTab";

export default class BonWorkflow extends Plugin {
	private folderNames: FolderTaskItem[] = [];
	private statusBar: CustomStatusBar | null = null;
	private statusBarEl: HTMLElement | null = null;

	public settings: BonbonSettings;

	async onload() {
		await this.loadSettings();

		// Add settings tab
		this.addSettingTab(new BonWorkflowSettingTab(this.app, this));

		if (this.settings.enableCount) {
			this.loadStatusBar();
		}

		this.app.workspace.onLayoutReady(async () => {
			const file = this.app.vault.getFileByPath("TODO.md");
			if (!file) {
				return;
			}
			if (file) {
				const taskItems = await handleTaskChanges(
					this.app,
					file,
					this.app.metadataCache.getFileCache(file) as CachedMetadata
				);

				if (taskItems) {
					this.folderNames = taskItems;
					updateFileExplorerCheckboxes(this.app, this.folderNames);
				}
			}
		});

		// Monitor for task changes
		this.registerEvent(
			this.app.metadataCache.on(
				"changed",
				async (file: TFile, data: string, cache: CachedMetadata) => {
					const taskItems = await handleTaskChanges(
						this.app,
						file,
						cache
					);
					if (taskItems) {
						this.folderNames = taskItems;
						updateFileExplorerCheckboxes(
							this.app,
							this.folderNames
						);
					}
				}
			)
		);

		this.registerEvent(
			this.app.workspace.on("file-menu", this.onFileMenu.bind(this))
		);

		this.registerMarkdownPostProcessor((element, context) =>
			handleCallouts(element, this, context)
		);

		// Always register the editor extension, but check settings in onChange
		// this.registerEditorExtension(
		// 	inputCounter({
		// 		countChars: true,
		// 		countPunctuation: true,
		// 		onChange: (counts) => {
		// 			if (this.settings.enableCount && this.statusBar) {
		// 				this.statusBar.update(counts);
		// 			}
		// 		},
		// 		getCounts: () => {
		// 			return (
		// 				this.statusBar?.getCounts() ?? {
		// 					characters: 0,
		// 					punctuation: 0,
		// 					pasteCount: 0,
		// 					dropCount: 0,
		// 					compositionLength: 0,
		// 					compositionStartPos: 0,
		// 					compositionEndPos: 0,
		// 				}
		// 			);
		// 		},
		// 	})
		// );

		// this.registerView(VIEW_TYPE, (leaf) => new TemplateManagerView(leaf));
		// Register subscription codeblock processor
		this.registerMarkdownCodeBlockProcessor(
			"subscription",
			(source, el, ctx) => {
				renderSubscription(source, el, ctx);
			}
		);
	}

	onunload() {
		if (this.statusBar) {
			this.unloadStatusBar();
		}
	}

	loadStatusBar() {
		if (!this.statusBar) {
			this.statusBarEl = this.addStatusBarItem();
			this.statusBar = new CustomStatusBar(
				this.statusBarEl,
				{
					countChars: true,
				},
				this
			);
			this.addChild(this.statusBar);
			this.statusBar.onload();
		}
	}

	unloadStatusBar() {
		if (this.statusBar) {
			this.statusBar.onunload();
			this.removeChild(this.statusBar);
			if (this.statusBarEl) {
				this.statusBarEl.remove();
				this.statusBarEl = null;
			}
			this.statusBar = null;
		}
	}

	onFileMenu(
		menu: Menu,
		file: TAbstractFile,
		source: string,
		leaf?: WorkspaceLeaf
	) {
		menu.addItem((item) => {
			item.setIcon("search")
				.setTitle(
					file instanceof TFolder
						? "Search in selected folder"
						: "Search in selected file"
				)
				.onClick(() => {
					const leaf =
						this.app.workspace.getLeavesOfType("search")[0];
					if (leaf?.isDeferred) {
						leaf.loadIfDeferred();
					}
					const viewState = leaf?.getViewState();
					this.app.workspace.revealLeaf(leaf);
					leaf?.setViewState({
						...viewState,
						active: true,
					});
					leaf?.view.setState(
						{
							query:
								file instanceof TFolder
									? `path:"${file.path}/"`
									: `path:"${file.path}"`,
						},
						{
							history: false,
						}
					);
				});
		});

		// if (file instanceof TFolder) {
		// 	menu.addItem((item) => {
		// 		item.setIcon("layout-template")
		// 			.setTitle("Template Manager")
		// 			.onClick(() => {
		// 				this.activateView(file);
		// 			});
		// 	});
		// }
	}

	// async activateView(folder: TFolder = this.app.vault.getRoot()) {
	// 	const { workspace } = this.app;
	// 	let leaf = workspace.getLeaf(true);

	// 	await leaf.setViewState({
	// 		type: VIEW_TYPE,
	// 		active: true,
	// 		state: {
	// 			folder: folder.path,
	// 		},
	// 	});

	// 	workspace.revealLeaf(leaf);
	// }

	async loadSettings() {
		this.settings = Object.assign(
			{},
			BONBON_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

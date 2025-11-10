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
import { TypstScriptManager } from "./typst/typstScriptManager";
import { TypstConverter } from "./typst/typstConverter";
import { DEFAULT_TYPST_SETTINGS } from "./typst/typstSettings";

export default class BonWorkflow extends Plugin {
	private folderNames: FolderTaskItem[] = [];
	private statusBar: CustomStatusBar | null = null;
	private statusBarEl: HTMLElement | null = null;
	private typstConverter: TypstConverter | null = null;
	private typstScriptManager: TypstScriptManager | null = null;

	public settings: BonbonSettings;

	async onload() {
		await this.loadSettings();
		this.registerExtensions(["typ"], "markdown");
		await this.initializeTypstFeatures();

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

					if (this.typstConverter) {
						try {
							const shouldConvert =
								this.typstConverter.shouldConvert(
									file,
									cache
								);
							if (shouldConvert) {
								await this.typstConverter.convertFile(
									file,
									cache,
									{
										silent: true,
									}
								);
							}
						} catch (error) {
							console.error(
								"Typst auto conversion failed",
								error
							);
						}
					}
				}
			)
		);

		this.registerEvent(
			this.app.workspace.on("file-menu", this.onFileMenu.bind(this))
		);

		this.addCommand({
			id: "convert-to-typst",
			name: "Convert current note to Typst",
			checkCallback: (checking) => {
				if (!this.typstConverter) {
					return false;
				}
				const file = this.app.workspace.getActiveFile();
				if (!file || file.extension.toLowerCase() !== "md") {
					return false;
				}
				if (checking) {
					return true;
				}
				this.typstConverter
					.convertFile(
						file,
						this.app.metadataCache.getFileCache(file),
						{
							silent: false,
						}
					)
					.catch((error) =>
						console.error("Typst conversion failed", error)
					);
				return true;
			},
		});

		this.addCommand({
			id: "recompile-typst",
			name: "Recompile current Typst file",
			checkCallback: (checking) => {
				if (!this.typstConverter) {
					return false;
				}
				const file = this.app.workspace.getActiveFile();
				if (!file || file.extension.toLowerCase() !== "typ") {
					return false;
				}
				if (checking) {
					return true;
				}
				this.typstConverter
					.compileTypstFile(file.path, false)
					.catch((error) =>
						console.error("Typst compile failed", error)
					);
				return true;
			},
		});

		this.registerMarkdownPostProcessor((element, context) =>
			handleCallouts(element, this, context)
		);

		// Always register the editor extension, but check settings in onChange
		if (this.settings.enableCount) {
			this.registerEditorExtension(
				inputCounter({
					countChars: true,
					countPunctuation: true,
					onChange: (counts) => {
						if (this.settings.enableCount && this.statusBar) {
							this.statusBar.update(counts);
						}
					},
					getCounts: () => {
						return (
							this.statusBar?.getCounts() ?? {
								characters: 0,
								punctuation: 0,
								pasteCount: 0,
								dropCount: 0,
								compositionLength: 0,
								compositionStartPos: 0,
								compositionEndPos: 0,
							}
						);
					},
				})
			);
		}

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
			// 确保清理已存在的状态栏元素，防止重复创建
			if (this.statusBarEl) {
				this.statusBarEl.remove();
				this.statusBarEl = null;
			}
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

	private async initializeTypstFeatures(): Promise<void> {
		this.typstConverter = null;
		this.typstScriptManager = null;

		if (!this.settings.typst) {
			return;
		}

		try {
			this.typstScriptManager = new TypstScriptManager(
				this.app.vault,
				this.settings.typst.scriptDirectory
			);
			await this.typstScriptManager.ensureScriptDirectory();
			await this.typstScriptManager.initializeDefaultScript();

			this.typstConverter = new TypstConverter(
				this.app,
				this.settings.typst,
				this.typstScriptManager
			);
		} catch (error) {
			console.error("Failed to initialize Typst features", error);
			this.typstConverter = null;
			this.typstScriptManager = null;
		}
	}

	public async refreshTypstFeatures(): Promise<void> {
		await this.initializeTypstFeatures();
	}

	public getTypstScriptManager(): TypstScriptManager | null {
		return this.typstScriptManager;
	}

	async loadSettings() {
		const data = await this.loadData();
		this.settings = Object.assign({}, BONBON_SETTINGS, data);
		this.settings.historyChars = {
			...(BONBON_SETTINGS.historyChars ?? {}),
			...(data?.historyChars ?? {}),
		};
		this.settings.typst = {
			...DEFAULT_TYPST_SETTINGS,
			...(this.settings.typst ?? {}),
		};
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

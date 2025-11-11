import {
	type Menu,
	Notice,
	Plugin,
	type TAbstractFile,
	TFolder,
	type WorkspaceLeaf,
	type TFile,
	type CachedMetadata,
	debounce,
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
import { TYPST_VIEW_TYPE, TypstView } from "./typst/typstView";
import { TypstAPI } from "./typst/api";

export default class BonWorkflow extends Plugin {
	private folderNames: FolderTaskItem[] = [];
	private statusBar: CustomStatusBar | null = null;
	private statusBarEl: HTMLElement | null = null;
	private typstConverter: TypstConverter | null = null;
	private typstScriptManager: TypstScriptManager | null = null;
	private typstAPI: TypstAPI | null = null;
	private typstWasmRenderer: any = null; // TypstWasmRenderer instance

	public settings: BonbonSettings;

	async onload() {
		await this.loadSettings();

		if (this.settings.typst && this.settings.typst.enabled) {
			this.registerView(TYPST_VIEW_TYPE, (leaf) => new TypstView(leaf));
			this.registerExtensions(["typ"], TYPST_VIEW_TYPE);
			await this.initializeTypstFeatures();
		}

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
					this.triggerDebounce(file, data, cache);
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

		// Register typst codeblock processor
		if (this.settings.typst?.enableCodeBlock) {
			await this.initializeTypstWasmRenderer();
		}
	}

	onunload() {
		// 清理状态栏
		if (this.statusBar) {
			this.unloadStatusBar();
		}

		// 清理全局 Typst API，防止内存泄漏和全局作用域污染
		this.unloadTypstFeatures();
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
			// addChild() 会自动调用子组件的 onload()，无需手动调用
			this.addChild(this.statusBar);
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
		this.typstAPI = null;

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

			// 初始化 API 并注册到全局作用域
			this.typstAPI = new TypstAPI(
				this.typstConverter,
				this.typstScriptManager,
				this.app
			);

			// 注册全局 API
			this.registerGlobalTypstAPI();
		} catch (error) {
			console.error("Failed to initialize Typst features", error);
			this.typstConverter = null;
			this.typstScriptManager = null;
			this.typstAPI = null;
		}
	}

	public async refreshTypstFeatures(): Promise<void> {
		await this.initializeTypstFeatures();
	}

	/**
	 * 卸载 Typst 功能并清理全局 API
	 * 防止内存泄漏和全局作用域污染
	 */
	public unloadTypstFeatures(): void {
		this.unregisterGlobalTypstAPI();
		this.typstConverter = null;
		this.typstScriptManager = null;
		this.typstAPI = null;
		// this.unregisterView(TYPST_VIEW_TYPE);
		// this.unregisterExtensions(["typ"], TYPST_VIEW_TYPE);
	}

	/**
	 * 初始化 Typst WASM 渲染器并注册代码块处理器
	 */
	private async initializeTypstWasmRenderer(): Promise<void> {
		try {
			// 动态导入模块
			const { TypstWasmRenderer } = await import(
				"./typst/typstWasmRenderer"
			);
			const { createTypstCodeBlockProcessor } = await import(
				"./typst/typstCodeBlockProcessor"
			);

			// 创建渲染器实例
			this.typstWasmRenderer = new TypstWasmRenderer(
				this.settings.typst?.codeBlockCacheSize ?? 100
			);

			// 初始化 WASM
			await this.typstWasmRenderer.initialize();

			// 注册代码块处理器
			this.registerMarkdownCodeBlockProcessor(
				"typst",
				createTypstCodeBlockProcessor(this.typstWasmRenderer)
			);

			console.log("Typst WASM renderer initialized and registered");
		} catch (error) {
			console.error(
				"Failed to initialize Typst WASM renderer:",
				error
			);
			new Notice(
				`Typst 代码块渲染初始化失败: ${
					error instanceof Error ? error.message : String(error)
				}`
			);
		}
	}

	/**
	 * 注册全局 Typst API 到 window.bon.typst
	 */
	private registerGlobalTypstAPI(): void {
		if (!this.typstAPI) {
			console.warn(
				"[Bon-Workflow] Cannot register global API: typstAPI is null"
			);
			return;
		}

		try {
			// 确保 window.bon 命名空间存在
			if (typeof window.bon === "undefined") {
				window.bon = {};
			}

			// 注册 API 方法，使用 .bind() 确保 this 上下文正确
			window.bon.typst = {
				convert: this.typstAPI.convert.bind(this.typstAPI),
				convertAsync: this.typstAPI.convertAsync.bind(this.typstAPI),
				listScripts: this.typstAPI.listScripts.bind(this.typstAPI),
			};

			console.log(
				"[Bon-Workflow] Global Typst API registered at window.bon.typst"
			);
		} catch (error) {
			console.error(
				"[Bon-Workflow] Failed to register global Typst API:",
				error
			);
		}
	}

	/**
	 * 清理全局 Typst API
	 */
	private unregisterGlobalTypstAPI(): void {
		try {
			if (window.bon?.typst) {
				delete window.bon.typst;
				console.log(
					"[Bon-Workflow] Global Typst API unregistered"
				);
			}

			// 如果 window.bon 为空对象，也删除它
			if (
				window.bon &&
				Object.keys(window.bon).length === 0
			) {
				delete window.bon;
			}
		} catch (error) {
			console.error(
				"[Bon-Workflow] Failed to unregister global Typst API:",
				error
			);
		}
	}

	public getTypstScriptManager(): TypstScriptManager | null {
		return this.typstScriptManager;
	}

	public getTypstWasmRenderer(): any | null {
		return this.typstWasmRenderer;
	}

	private triggerDebounce = debounce(
		async (file: TFile, data: string, cache: CachedMetadata) => {
			const taskItems = await handleTaskChanges(this.app, file, cache);
			if (taskItems) {
				this.folderNames = taskItems;
				updateFileExplorerCheckboxes(this.app, this.folderNames);
			}

			if (this.typstConverter) {
				try {
					const shouldConvert = this.typstConverter.shouldConvert(
						file,
						cache
					);
					if (shouldConvert) {
						await this.typstConverter.convertFile(file, cache, {
							silent: true,
						});
					}
				} catch (error) {
					console.error("Typst auto conversion failed", error);
				}
			}
		},
		1000
	);

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

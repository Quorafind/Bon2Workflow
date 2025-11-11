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
	type MarkdownView,
} from "obsidian";
import {
	type FolderTaskItem,
	handleCallouts,
	handleTaskChanges,
	updateFileExplorerCheckboxes,
} from "./utils";
import { inputCounter } from "./editor/countInput";
import { CustomStatusBar } from "./statusbar";
import { bon2workflow_SETTINGS, type bon2workflowSettings } from "./settings";
// import { VIEW_TYPE } from "./view";
import { renderSubscription } from "./Subscription";
import { BonWorkflowSettingTab } from "./settingTab";
import { TypstScriptManager } from "./typst/typstScriptManager";
import { TypstConverter } from "./typst/typstConverter";
import { DEFAULT_TYPST_SETTINGS } from "./typst/typstSettings";
import { TYPST_VIEW_TYPE, TypstView } from "./typst/typstView";
import {
	TYPST_PREVIEW_VIEW_TYPE,
	TypstPreviewView,
} from "./typst/typstPreviewView";
import { TypstAPI } from "./typst/api";
import { TypstWasmRenderer } from "./typst/typstWasmRenderer";
import { createTypstCodeBlockProcessor } from "./typst/typstCodeBlockProcessor";

export default class BonWorkflow extends Plugin {
	private folderNames: FolderTaskItem[] = [];
	private statusBar: CustomStatusBar | null = null;
	private statusBarEl: HTMLElement | null = null;
	private typstConverter: TypstConverter | null = null;
	private typstScriptManager: TypstScriptManager | null = null;
	private typstAPI: TypstAPI | null = null;
	private typstWasmRenderer: any = null; // TypstWasmRenderer instance

	public settings: bon2workflowSettings;

	async onload() {
		await this.loadSettings();

		if (this.settings.typst && this.settings.typst.enabled) {
			this.registerView(TYPST_VIEW_TYPE, (leaf) => new TypstView(leaf));
			this.registerExtensions(["typ"], TYPST_VIEW_TYPE);

			// Register preview view (only when WASM rendering is enabled)
			if (this.settings.typst.enableCodeBlock) {
				await this.initializeTypstWasmRenderer();

				// Register preview view
				this.registerView(
					TYPST_PREVIEW_VIEW_TYPE,
					(leaf) =>
						new TypstPreviewView(
							leaf,
							this.typstWasmRenderer,
							this.typstConverter!
						)
				);
			}

			await this.initializeTypstFeatures();

			this.registerEvent(
				this.app.metadataCache.on(
					"changed",
					async (
						file: TFile,
						data: string,
						cache: CachedMetadata
					) => {
						this.triggerDebounce(file, data, cache);
					}
				)
			);
		}

		// Add settings tab
		this.addSettingTab(new BonWorkflowSettingTab(this.app, this));

		if (this.settings.enableCount) {
			this.loadStatusBar();
		}

		this.app.workspace.onLayoutReady(async () => {
			if (!this.settings.folderCheck.enabled) {
				return;
			}
			const file = this.app.vault.getFileByPath(
				this.settings.folderCheck.targetPath
			);
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
			this.app.workspace.on("file-menu", this.onFileMenu.bind(this))
		);

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
		// Clean up status bar
		if (this.statusBar) {
			this.unloadStatusBar();
		}

		// Clean up global Typst API to prevent memory leaks and global scope pollution
		this.unloadTypstFeatures();
	}

	loadStatusBar() {
		if (!this.statusBar) {
			// Ensure to remove existing status bar element to prevent duplicate creation
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
			// addChild() will automatically call the child's onload(), no need to invoke manually
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

			// Set preview update callback (according to preview mode)
			const previewMode = this.settings.typst.previewMode;
			if (previewMode !== "none") {
				this.typstConverter.setPreviewUpdateCallback(
					async (file, typstCode) => {
						await this.updateTypstPreview(
							file,
							typstCode,
							previewMode
						);
					}
				);
			} else {
				// Remove callback to avoid invalid preview updates
				this.typstConverter.setPreviewUpdateCallback(null);
			}

			// Initialize API and register to global context
			this.typstAPI = new TypstAPI(
				this.typstConverter,
				this.typstScriptManager,
				this.app
			);

			// Register global API
			this.registerGlobalTypstAPI();

			// Register Typst commands
			this.registerTypstCommands();
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
	 * Unload Typst features and clean up global API
	 * Prevent memory leaks and global scope pollution
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
	 * Initialize Typst WASM renderer and register code block processor
	 */
	private async initializeTypstWasmRenderer(): Promise<void> {
		try {
			// Create renderer instance
			this.typstWasmRenderer = new TypstWasmRenderer(
				this.settings.typst?.codeBlockCacheSize ?? 100
			);

			// Initialize WASM
			await this.typstWasmRenderer.initialize();

			// Register code block processor
			this.registerMarkdownCodeBlockProcessor(
				"typst",
				createTypstCodeBlockProcessor(this.typstWasmRenderer)
			);

			console.log("Typst WASM renderer initialized and registered");
		} catch (error) {
			console.error("Failed to initialize Typst WASM renderer:", error);
			new Notice(
				`Typst code block rendering initialization failed: ${
					error instanceof Error ? error.message : String(error)
				}`
			);
		}
	}

	/**
	 * Register global Typst API to window.bon.typst
	 */
	private registerGlobalTypstAPI(): void {
		if (!this.typstAPI) {
			console.warn(
				"[Bon-Workflow] Cannot register global API: typstAPI is null"
			);
			return;
		}

		try {
			// Ensure window.bon namespace exists
			if (typeof window.bon === "undefined") {
				window.bon = {};
			}

			// Register API methods, use .bind() to ensure correct this context
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
	 * Clean up the global Typst API
	 */
	private unregisterGlobalTypstAPI(): void {
		try {
			if (window.bon?.typst) {
				delete window.bon.typst;
				console.log("[Bon-Workflow] Global Typst API unregistered");
			}

			// If window.bon is an empty object, also delete it
			if (window.bon && Object.keys(window.bon).length === 0) {
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

			// Only trigger conversion if auto-compile is enabled
			if (
				this.typstConverter &&
				this.settings.typst &&
				this.settings.typst.autoCompile
			) {
				try {
					const shouldConvert = this.typstConverter.shouldConvert(
						file,
						cache
					);

					// Determine whether to convert depending on preview mode
					const previewMode =
						this.settings.typst.previewMode ?? "wasm";
					if (shouldConvert && previewMode !== "none") {
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
		this.settings = Object.assign({}, bon2workflow_SETTINGS, data);
		this.settings.historyChars = {
			...(bon2workflow_SETTINGS.historyChars ?? {}),
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

	/**
	 * Open or activate Typst preview view
	 */
	private async activateTypstPreviewView(): Promise<void> {
		const { workspace } = this.app;

		// Check if preview view is already open
		let leaf = workspace.getLeavesOfType(TYPST_PREVIEW_VIEW_TYPE)[0];

		if (!leaf) {
			// Create a new right sidebar panel
			leaf = workspace.getLeaf("split", "vertical");
			if (leaf) {
				await leaf.setViewState({
					type: TYPST_PREVIEW_VIEW_TYPE,
					active: true,
				});
			}
		}

		// Activate the view
		if (leaf) {
			workspace.revealLeaf(leaf);
		}
	}

	/**
	 * Update Typst preview view
	 */
	private async updateTypstPreview(
		file: TFile,
		typstCode: string,
		mode: "wasm" | "compile"
	): Promise<void> {
		const { workspace } = this.app;

		// Find preview views
		const leaves = workspace.getLeavesOfType(TYPST_PREVIEW_VIEW_TYPE);

		if (leaves.length > 0) {
			for (const leaf of leaves) {
				const view = leaf.view;
				if (view instanceof TypstPreviewView) {
					if (mode === "wasm") {
						// WASM mode: Render Typst code, fallback to CLI on failure
						const format =
							this.settings.typst?.compileFormat ?? "svg";
						await view.updatePreviewWithFallback(
							file,
							typstCode,
							format
						);
					} else if (mode === "compile" && this.typstConverter) {
						// CLI mode: Compile file and load result
						try {
							const typstPath = this.buildTypstPath(file);
							const format =
								this.settings.typst?.compileFormat ?? "svg";
							const outputPath =
								await this.typstConverter.compileTypstFile(
									typstPath,
									format,
									true // silent
								);
							await view.updatePreviewFromFile(
								file,
								outputPath,
								format
							);
						} catch (error) {
							console.error("CLI compile failed:", error);
							new Notice(
								`Typst CLI compilation failed: ${
									error instanceof Error
										? error.message
										: String(error)
								}`
							);
						}
					}
				}
			}
		}
	}

	/**
	 * Build Typst file path
	 */
	private buildTypstPath(file: TFile): string {
		const extensionPattern = new RegExp(`\\.${file.extension}$`, "i");
		if (!extensionPattern.test(file.path)) {
			return `${file.path}.typ`;
		}
		return file.path.replace(extensionPattern, ".typ");
	}

	/**
	 * Register Typst-related commands (only called when Typst features are enabled)
	 */
	private registerTypstCommands(): void {
		const checkConvertToTypst = (
			checking: boolean,
			format: "pdf" | "png" | "svg"
		) => {
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
				.convertFile(file, this.app.metadataCache.getFileCache(file), {
					silent: false,
					format,
				})
				.catch((error) =>
					console.error("Typst conversion failed", error)
				);
			return true;
		};

		this.addCommand({
			id: "convert-to-typst-pdf",
			name: "Convert current note to Typst and compile to PDF",
			checkCallback: (checking) => {
				return checkConvertToTypst(checking, "pdf");
			},
		});

		this.addCommand({
			id: "convert-to-typst-png",
			name: "Convert current note to Typst and compile to PNG",
			checkCallback: (checking) => {
				return checkConvertToTypst(checking, "png");
			},
		});

		this.addCommand({
			id: "convert-to-typst-svg",
			name: "Convert current note to Typst and compile to SVG",
			checkCallback: (checking) => {
				return checkConvertToTypst(checking, "svg");
			},
		});

		this.addCommand({
			id: "open-typst-preview",
			name: "Open Typst preview",
			checkCallback: (checking) => {
				if (!this.settings.typst?.enableCodeBlock) {
					return false;
				}
				if (checking) {
					return true;
				}
				this.activateTypstPreviewView();
				return true;
			},
		});
	}
}

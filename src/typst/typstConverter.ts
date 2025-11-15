import {
	App,
	CachedMetadata,
	FileSystemAdapter,
	Notice,
	Platform,
	TFile,
} from "obsidian";
import { exec } from "child_process";
import { TypstSettings } from "./typstSettings";
import { TypstScriptManager } from "./typstScriptManager";
import { TypstTemplateManager } from "./typstTemplateManager";
import { executeSandbox } from "./typstSandbox";
import { markdownToTypst, type EmbedEnvironment } from "./transformer";
import { TypstPathResolver } from "./typstPathResolver";
import { TypstNotFoundError, TypstInvalidPathError } from "./typstErrors";

interface ConvertOptions {
	silent?: boolean;
	format?: "pdf" | "png" | "svg";
}

export interface MarkdownConvertOptions {
	transformMode?: "ast" | "script";
	scriptName?: string;
	templateName?: string;
	maxEmbedDepth?: number;
	currentFile?: string;
}

/**
 * Preview update callback function
 * @param file The source file
 * @param typstCode The converted Typst code
 */
export type PreviewUpdateCallback = (
	file: TFile,
	typstCode: string
) => Promise<void>;

export class TypstConverter {
	private readonly triggerTagSet: Set<string>;
	private previewUpdateCallback: PreviewUpdateCallback | null = null;
	private readonly pathResolver: TypstPathResolver;
	private readonly templateManager: TypstTemplateManager;

	constructor(
		private app: App,
		private settings: TypstSettings,
		private scriptManager: TypstScriptManager
	) {
		this.triggerTagSet = new Set(
			(this.settings.triggerTags ?? ["bon-typst"]).map((tag) =>
				tag.toLowerCase()
			)
		);
		this.pathResolver = new TypstPathResolver();
		this.templateManager = new TypstTemplateManager(
			this.app.vault,
			this.settings.templateDirectory
		);
	}

	/**
	 * Set preview update callback
	 */
	setPreviewUpdateCallback(callback: PreviewUpdateCallback | null): void {
		this.previewUpdateCallback = callback;
	}

	shouldConvert(file: TFile, metadata: CachedMetadata | null): boolean {
		if (!metadata || file.extension.toLowerCase() !== "md") {
			return false;
		}

		const tags = this.extractTags(metadata);
		return tags.some((tag) => this.triggerTagSet.has(tag));
	}

	/**
	 * Select script name to use for transformation
	 * Priority: frontmatter > folder mapping > user default script
	 * @returns The script name (never null - always fallback to defaultScriptName)
	 */
	selectScript(file: TFile, metadata: CachedMetadata | null): string {
		// 1. Check frontmatter
		const frontmatter = metadata?.frontmatter ?? {};
		const frontmatterScript = frontmatter["typst-script"];
		if (typeof frontmatterScript === "string" && frontmatterScript.trim()) {
			return this.normalizeScriptName(frontmatterScript);
		}

		// 2. Check folder mapping
		const folderPath = file.parent?.path ?? "";
		const mapping = this.settings.templateMapping ?? {};
		if (folderPath && mapping[folderPath]) {
			return this.normalizeScriptName(mapping[folderPath]);
		}

		// 3. Use user's default script
		return this.settings.defaultScriptName || "default";
	}

	/**
	 * Select template name to use for formatting
	 * Priority: frontmatter > folder mapping > user default template
	 * @returns The template name (never null - always fallback to defaultTemplateName)
	 */
	selectTemplate(file: TFile, metadata: CachedMetadata | null): string {
		// 1. Check frontmatter
		const frontmatter = metadata?.frontmatter ?? {};
		const frontmatterTemplate = frontmatter["typst-template"];
		if (
			typeof frontmatterTemplate === "string" &&
			frontmatterTemplate.trim()
		) {
			return this.normalizeTemplateName(frontmatterTemplate);
		}

		// 2. Check folder mapping
		const folderPath = file.parent?.path ?? "";
		const mapping = this.settings.templateFolderMapping ?? {};
		if (folderPath && mapping[folderPath]) {
			return this.normalizeTemplateName(mapping[folderPath]);
		}

		// 3. Use user's default template
		return this.settings.defaultTemplateName || "default";
	}

	async convertFile(
		file: TFile,
		metadata?: CachedMetadata | null,
		options: ConvertOptions = {}
	): Promise<void> {
		const cache = metadata ?? this.app.metadataCache.getFileCache(file);

		try {
			const markdown = await this.app.vault.read(file);

			// Select script (never null - always uses defaultScriptName as fallback)
			const selectedScript = this.selectScript(file, cache);

			// Select template (if enabled)
			const selectedTemplate = this.settings.enableTemplateSystem
				? this.selectTemplate(file, cache)
				: undefined;

			// Always use script mode (script will call AST converter internally)
			const typstContent = await this.convertMarkdown(markdown, {
				transformMode: "script",
				scriptName: selectedScript,
				templateName: selectedTemplate,
				maxEmbedDepth: this.settings.maxEmbedDepth,
				currentFile: file.path,
			});
			const typstPath = this.buildTypstPathNew(file);

			await this.writeTypstFile(typstPath, typstContent);

			if (!options.silent) {
				new Notice(`Typst file updated: ${typstPath}`);
			}

			// Trigger preview update (according to preview mode)
			if (this.previewUpdateCallback) {
				try {
					await this.previewUpdateCallback(file, typstContent);
				} catch (error) {
					console.error("Preview update failed:", error);
				}
			}

			// Auto-compile (if enabled)
			if (this.settings.autoCompile) {
				const format =
					options?.format ?? this.settings.compileFormat ?? "pdf";
				await this.compileTypstFile(
					typstPath,
					format,
					options.silent,
					file,
					cache
				);
			}
		} catch (error) {
			const message =
				error instanceof Error ? error.message : String(error);
			new Notice(`Typst conversion failed: ${message}`);
			throw error;
		}
	}

	/**
	 * Converts a Markdown string to Typst format
	 * This is a public method available to the API layer.
	 *
	 * @param markdown - Markdown content
	 * @param options - Transform options
	 * @returns Promise resolving to Typst string
	 */
	public async convertMarkdown(
		markdown: string,
		options: MarkdownConvertOptions = {}
	): Promise<string> {
		const {
			transformMode = this.settings.transformMode,
			scriptName = "default",
			templateName,
			maxEmbedDepth = this.settings.maxEmbedDepth,
			currentFile,
		} = options;

		// Step 1: Convert Markdown to Typst using script or AST
		let typstContent: string;

		if (transformMode === "script") {
			const scriptCode = await this.scriptManager.loadScript(scriptName);

			// Create and inject AST conversion function into the sandbox
			const convertFn = this.createAstConverter(
				currentFile ?? "",
				maxEmbedDepth
			);

			// Pass the conversion function into the sandbox
			typstContent = await executeSandbox(
				scriptCode,
				markdown,
				convertFn
			);
		} else {
			const embedEnvironment: EmbedEnvironment = {
				app: this.app,
				vault: this.app.vault,
				currentFile: currentFile ?? "",
			};

			typstContent = await markdownToTypst(
				markdown,
				{
					maxEmbedDepth,
					enableCheckboxEnhancement:
						this.settings.enableCheckboxEnhancement ?? true,
				},
				embedEnvironment
			);
		}

		// Step 2: Apply template (if enabled and template name provided)
		if (this.settings.enableTemplateSystem && templateName) {
			typstContent = await this.applyTemplate(typstContent, templateName);
		}

		return typstContent;
	}

	/**
	 * Apply template to converted Typst content (prepend template)
	 * @param content Converted Typst content
	 * @param templateName Template name to apply
	 * @returns Template + content
	 */
	private async applyTemplate(
		content: string,
		templateName: string
	): Promise<string> {
		const templateContent = await this.templateManager.loadTemplate(
			templateName
		);
		// Prepend template to content with clear separator
		return `${templateContent}\n\n${content}`;
	}

	private async runWithScriptEngine(
		file: TFile,
		metadata: CachedMetadata | null,
		markdown: string
	): Promise<string> {
		const scriptName = this.selectScript(file, metadata);
		const scriptCode = await this.scriptManager.loadScript(scriptName);

		// Create and inject AST conversion function into the sandbox
		const convertFn = this.createAstConverter(file.path);

		return await executeSandbox(scriptCode, markdown, convertFn);
	}

	private async runWithAstTransformer(
		file: TFile,
		markdown: string
	): Promise<string> {
		const embedEnvironment: EmbedEnvironment = {
			app: this.app,
			vault: this.app.vault,
			currentFile: file.path,
		};
		return markdownToTypst(
			markdown,
			{
				maxEmbedDepth: this.settings.maxEmbedDepth,
				enableCheckboxEnhancement:
					this.settings.enableCheckboxEnhancement ?? true,
			},
			embedEnvironment
		);
	}

	/**
	 * Compile Typst file to the specified format
	 * @param typstPath Typst source file path
	 * @param format Output format (pdf/png/svg)
	 * @param silent Silent mode
	 * @param sourceFile Source markdown file (optional, for new path logic)
	 * @param metadata File metadata (optional, for output naming)
	 * @returns Output file path
	 */
	async compileTypstFile(
		typstPath: string,
		format: "pdf" | "png" | "svg" = "pdf",
		silent = false,
		sourceFile?: TFile,
		metadata?: CachedMetadata | null
	): Promise<string> {
		// Early check: CLI compilation only available on desktop
		if (!Platform.isDesktopApp) {
			const errorMsg =
				"CLI compilation is only available on desktop. Use WASM preview on mobile.";
			if (!silent) {
				new Notice(errorMsg);
			}
			throw new Error(errorMsg);
		}

		const adapter = this.app.vault.adapter;
		if (!(adapter instanceof FileSystemAdapter)) {
			throw new Error(
				"The current storage adapter does not support automatic Typst compilation"
			);
		}

		// Resolve Typst CLI path
		let typstCliPath: string;
		try {
			typstCliPath = await this.pathResolver.resolveTypstPath(
				this.settings.typstCliPath
			);
		} catch (error) {
			if (error instanceof TypstNotFoundError) {
				new Notice(error.toUserMessage());
				throw error;
			}
			if (error instanceof TypstInvalidPathError) {
				new Notice(error.toUserMessage());
				throw error;
			}
			throw error;
		}

		const fullPath = adapter.getFullPath(typstPath);
		const vaultRoot = adapter.getFullPath("");

		// Build output path
		let outputPath: string;
		let fullOutputPath: string;

		if (sourceFile && metadata !== undefined) {
			// 使用新的路径构建逻辑
			outputPath = this.buildOutputPath(sourceFile, format, metadata);
			fullOutputPath = adapter.getFullPath(outputPath);

			// 确保输出目录存在
			if (this.settings.outputDirectory) {
				const outputDirExists = await this.app.vault.adapter.exists(
					this.settings.outputDirectory
				);
				if (!outputDirExists) {
					await this.app.vault.createFolder(
						this.settings.outputDirectory
					);
				}
			}

			// 处理多页输出，确保文件夹存在
			if (format === "png" || format === "svg") {
				const folderPath = outputPath.replace(`/{n}.${format}`, "");
				const folderExists = await this.app.vault.adapter.exists(
					folderPath
				);
				if (!folderExists) {
					await this.app.vault.createFolder(folderPath);
				}
			}
		} else {
			// 降级到原有逻辑（向后兼容）
			if (format === "png" || format === "svg") {
				const basePath = typstPath.replace(/\.typ$/, "");
				const folderPath = `${basePath}-pages`;
				const folderExists = await this.app.vault.adapter.exists(
					folderPath
				);
				if (!folderExists) {
					await this.app.vault.createFolder(folderPath);
				}
				outputPath = `${folderPath}/{n}.${format}`;
				fullOutputPath = adapter.getFullPath(outputPath);
			} else {
				outputPath = typstPath.replace(/\.typ$/, `.${format}`);
				fullOutputPath = adapter.getFullPath(outputPath);
			}
		}

		await new Promise<void>((resolve, reject) => {
			// Use resolved path with proper quoting
			const command = `"${typstCliPath}" compile --root "${vaultRoot}" --format ${format} "${fullPath}" "${fullOutputPath}"`;
			exec(command, (error, stdout, stderr) => {
				if (error) {
					const message = stderr || stdout || error.message;
					new Notice(`Typst Compile Error: ${message}`);
					reject(error);
					return;
				}

				if (!silent) {
					this.showNoticeWithActions(outputPath, format);
				}
				resolve();
			});
		});

		// For PNG format, return the folder path
		if (format === "png") {
			const folderPath = outputPath.replace("/{n}.png", "");
			return folderPath;
		}
		return outputPath;
	}

	/**
	 * Create AST converter function (for injection into the sandbox)
	 *
	 * @param currentFile - Current file path
	 * @param maxEmbedDepth - Max embed depth
	 * @returns Async converter function
	 */
	private createAstConverter(
		currentFile: string,
		maxEmbedDepth: number = this.settings.maxEmbedDepth
	): (md: string) => Promise<string> {
		return async (md: string): Promise<string> => {
			const embedEnvironment: EmbedEnvironment = {
				app: this.app,
				vault: this.app.vault,
				currentFile,
			};
			return markdownToTypst(
				md,
				{
					maxEmbedDepth,
					enableCheckboxEnhancement:
						this.settings.enableCheckboxEnhancement ?? true,
				},
				embedEnvironment
			);
		};
	}

	private extractTags(metadata: CachedMetadata | null): string[] {
		if (!metadata?.frontmatter) {
			return [];
		}

		const rawTags = metadata.frontmatter["tags"];
		if (Array.isArray(rawTags)) {
			return rawTags
				.map((tag) => (typeof tag === "string" ? tag : ""))
				.filter(Boolean)
				.map((tag) => tag.toLowerCase());
		}

		if (typeof rawTags === "string") {
			return rawTags
				.split(/[,\s]+/)
				.map((tag) => tag.trim().toLowerCase())
				.filter(Boolean);
		}

		return [];
	}

	private normalizeScriptName(name: string): string {
		return name.replace(/\.js$/, "").trim() || "default";
	}

	private normalizeTemplateName(name: string): string {
		return name.replace(/\.typ$/, "").trim() || "default";
	}

	/**
	 * 构建 .typ 文件路径（支持三种存储模式）
	 * @param file 源 Markdown 文件
	 * @returns .typ 文件的完整路径
	 */
	private buildTypstPathNew(file: TFile): string {
		const mode = this.settings.typFileStorageMode;
		const baseName = file.basename; // 文件名（不含扩展名）

		switch (mode) {
			case "same-dir":
				// 与源文件同目录（默认行为）
				return file.path.replace(/\.md$/i, ".typ");

			case "unified":
			case "custom":
				const targetDir =
					this.settings.typFileDirectory || ".typst-temp";
				// 保留原始路径结构，避免冲突
				const relativePath = file.parent ? file.parent.path : "";
				const subPath = relativePath ? `${relativePath}/` : "";
				return `${targetDir}/${subPath}${baseName}.typ`;

			default:
				// 降级到默认行为
				return file.path.replace(/\.md$/i, ".typ");
		}
	}

	/**
	 * 解析输出文件的基础名称（不含扩展名）
	 * 优先级：frontmatter > folder > filename
	 * @param file 源文件
	 * @param metadata 文件元数据
	 * @returns 输出文件的基础名称
	 */
	private resolveOutputName(
		file: TFile,
		metadata: CachedMetadata | null
	): string {
		const priority = this.settings.outputNamingPriority;

		for (const source of priority) {
			switch (source) {
				case "frontmatter":
					const name = metadata?.frontmatter?.["typst-output-name"];
					if (typeof name === "string" && name.trim()) {
						return name.trim();
					}
					break;

				case "folder":
					// 添加非空检查，防止根目录返回空字符串
					if (
						file.parent &&
						file.parent.name &&
						file.parent.name !== "/"
					) {
						return file.parent.name;
					}
					break;

				case "filename":
					return file.basename;
			}
		}

		// 降级到文件名
		return file.basename;
	}

	/**
	 * 格式化时间戳为 YYYYMMDD-HHmmss
	 */
	private formatTimestamp(date: Date): string {
		const pad = (n: number) => n.toString().padStart(2, "0");
		const year = date.getFullYear();
		const month = pad(date.getMonth() + 1);
		const day = pad(date.getDate());
		const hour = pad(date.getHours());
		const minute = pad(date.getMinutes());
		const second = pad(date.getSeconds());
		return `${year}${month}${day}-${hour}${minute}${second}`;
	}

	/**
	 * 构建输出文件路径（pdf/png/svg）
	 * @param file 源文件
	 * @param format 输出格式
	 * @param metadata 文件元数据
	 * @returns 输出文件的完整路径
	 */
	private buildOutputPath(
		file: TFile,
		format: "pdf" | "png" | "svg",
		metadata: CachedMetadata | null
	): string {
		let baseName = this.resolveOutputName(file, metadata);

		// 最终防御：确保 baseName 不为空（防止根目录等边界情况）
		if (!baseName || baseName.trim() === "") {
			console.warn(
				`[TypstConverter] resolveOutputName returned empty for file "${file.path}", fallback to filename`
			);
			baseName = file.basename;
		}

		// 附加时间戳（如果启用）
		if (this.settings.outputAppendTimestamp) {
			const timestamp = this.formatTimestamp(new Date());
			baseName = `${baseName}-${timestamp}`;
		}

		// 确定输出目录
		const outputDir = this.settings.outputDirectory;
		const targetDir = outputDir || file.parent?.path || "";

		// 规范化路径：避免双斜杠或以斜杠开头
		const normalizePath = (dir: string, filename: string): string => {
			// 将根目录 "/" 视为空字符串，避免生成 "//filename"
			if (!dir || dir === "" || dir === "/") {
				return filename;
			}
			return `${dir}/${filename}`;
		};

		// 处理 PNG/SVG 的多页输出
		if (format === "png" || format === "svg") {
			const folderPath = normalizePath(targetDir, `${baseName}-pages`);
			return `${folderPath}/{n}.${format}`;
		}

		return normalizePath(targetDir, `${baseName}.${format}`);
	}

	/**
	 * @deprecated 已废弃，使用 buildTypstPathNew() 替代。保留此方法仅为向后兼容。
	 */
	private buildTypstPath(file: TFile): string {
		return this.buildTypstPathNew(file);
	}

	/**
	 * Write Typst content to a .typ file
	 * @param path File path
	 * @param content Typst content
	 */
	async writeTypstFile(path: string, content: string): Promise<void> {
		// 确保父目录存在
		const parentPath = path.substring(0, path.lastIndexOf("/"));
		if (parentPath) {
			const parentExists = await this.app.vault.adapter.exists(
				parentPath
			);
			if (!parentExists) {
				await this.app.vault.createFolder(parentPath);
			}
		}

		const existing = this.app.vault.getAbstractFileByPath(path);
		if (existing instanceof TFile) {
			await this.app.vault.modify(existing, content);
		} else {
			await this.app.vault.create(path, content);
		}
	}

	/**
	 * 显示带交互按钮的 Notice
	 * @param outputPath 输出文件的 vault 相对路径
	 * @param format 输出格式 (pdf/png/svg)
	 */
	private showNoticeWithActions(
		outputPath: string,
		format: "pdf" | "png" | "svg"
	): void {
		const adapter = this.app.vault.adapter;
		if (!(adapter instanceof FileSystemAdapter)) {
			// 降级到普通 Notice
			new Notice(`Typst Compile Success: ${outputPath}`);
			return;
		}

		const fullPath = adapter.getFullPath(outputPath);
		const shell = require("electron").shell; // 提取 shell 对象，避免重复 require

		// 使用 DocumentFragment 构建 Notice 内容
		const fragment = new DocumentFragment();

		// 主文本
		fragment.createSpan({
			text: `Typst compilation successful: `,
			cls: "typst-notice-text",
		});

		fragment.createEl("code", {
			text: outputPath,
			cls: "typst-notice-path",
		});

		fragment.createEl("br");
		fragment.createEl("br");

		// 按钮容器
		const btnContainer = fragment.createDiv({
			cls: "typst-notice-buttons",
		});

		// 按钮 1: 在文件管理器中显示
		// 所有格式都使用此功能定位文件/文件夹
		const btnShow = btnContainer.createEl("button", {
			text: "Show in File Manager",
			cls: "mod-cta",
		});
		btnShow.addEventListener("click", () => {
			try {
				// PNG/SVG 格式：定位到包含所有页面的文件夹
				if (format === "png" || format === "svg") {
					const folderPath = fullPath.replace(`/{n}.${format}`, "");
					shell.showItemInFolder(folderPath);
				} else {
					// PDF: 直接定位文件
					shell.showItemInFolder(fullPath);
				}
			} catch (error) {
				new Notice(
					`Failed to open file manager: ${
						error instanceof Error ? error.message : String(error)
					}`
				);
			}
		});

		// 按钮 2: 打开文件
		// PDF: Obsidian 内打开，PNG/SVG: 系统应用打开文件夹（包含所有页面）
		const btnOpen = btnContainer.createEl("button", {
			text: "Open",
		});
		btnOpen.addEventListener("click", async () => {
			try {
				if (format === "pdf") {
					// PDF: 在 Obsidian 中打开
					const file =
						this.app.vault.getAbstractFileByPath(outputPath);
					if (file instanceof TFile) {
						await this.app.workspace.getLeaf(false).openFile(file);
					} else {
						new Notice(`File not found: ${outputPath}`);
					}
				} else {
					// PNG/SVG: 智能检测页数并在 Obsidian 内打开第一页
					const folderPath = outputPath.replace(`/{n}.${format}`, "");

					// 获取文件夹中的所有页面文件
					const folderFiles = this.app.vault
						.getFiles()
						.filter(
							(f) =>
								f.path.startsWith(folderPath) &&
								f.extension === format
						);

					if (folderFiles.length === 0) {
						new Notice(
							`No ${format.toUpperCase()} files found in output folder`
						);
						return;
					}

					// 按文件名排序（确保 1.png 在最前）
					folderFiles.sort((a, b) => {
						const numA = parseInt(a.basename) || 0;
						const numB = parseInt(b.basename) || 0;
						return numA - numB;
					});

					// 打开第一页（在 Obsidian 内）
					const firstPage = folderFiles[0];
					await this.app.workspace.getLeaf(false).openFile(firstPage);
				}
			} catch (error) {
				new Notice(
					`Failed to open file: ${
						error instanceof Error ? error.message : String(error)
					}`
				);
			}
		});

		// 显示 Notice，8 秒后自动关闭
		new Notice(fragment, 8000);
	}

	/**
	 * Get path resolver (for settings UI)
	 */
	getPathResolver(): TypstPathResolver {
		return this.pathResolver;
	}

	/**
	 * Get template manager (for settings UI)
	 */
	getTemplateManager(): TypstTemplateManager {
		return this.templateManager;
	}

	/**
	 * Get settings (for internal use)
	 */
	getSettings(): TypstSettings {
		return this.settings;
	}
}

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
	typstCode: string,
) => Promise<void>;

export class TypstConverter {
	private readonly triggerTagSet: Set<string>;
	private previewUpdateCallback: PreviewUpdateCallback | null = null;
	private readonly pathResolver: TypstPathResolver;

	constructor(
		private app: App,
		private settings: TypstSettings,
		private scriptManager: TypstScriptManager,
	) {
		this.triggerTagSet = new Set(
			(this.settings.triggerTags ?? ["bon-typst"]).map((tag) =>
				tag.toLowerCase(),
			),
		);
		this.pathResolver = new TypstPathResolver();
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

	async convertFile(
		file: TFile,
		metadata?: CachedMetadata | null,
		options: ConvertOptions = {},
	): Promise<void> {
		const cache = metadata ?? this.app.metadataCache.getFileCache(file);

		try {
			const markdown = await this.app.vault.read(file);

			// Select script (never null - always uses defaultScriptName as fallback)
			const selectedScript = this.selectScript(file, cache);

			// Always use script mode (script will call AST converter internally)
			const typstContent = await this.convertMarkdown(markdown, {
				transformMode: "script",
				scriptName: selectedScript,
				maxEmbedDepth: this.settings.maxEmbedDepth,
				currentFile: file.path,
			});
			const typstPath = this.buildTypstPath(file);

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
				await this.compileTypstFile(typstPath, format, options.silent);
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
		options: MarkdownConvertOptions = {},
	): Promise<string> {
		const {
			transformMode = this.settings.transformMode,
			scriptName = "default",
			maxEmbedDepth = this.settings.maxEmbedDepth,
			currentFile,
		} = options;

		if (transformMode === "script") {
			const scriptCode = await this.scriptManager.loadScript(scriptName);

			// Create and inject AST conversion function into the sandbox
			const convertFn = this.createAstConverter(
				currentFile ?? "",
				maxEmbedDepth,
			);

			// Pass the conversion function into the sandbox
			return await executeSandbox(scriptCode, markdown, convertFn);
		} else {
			const embedEnvironment: EmbedEnvironment = {
				app: this.app,
				vault: this.app.vault,
				currentFile: currentFile ?? "",
			};

			return markdownToTypst(
				markdown,
				{
					maxEmbedDepth,
					enableCheckboxEnhancement: this.settings.enableCheckboxEnhancement ?? true,
				},
				embedEnvironment,
			);
		}
	}

	private async runWithScriptEngine(
		file: TFile,
		metadata: CachedMetadata | null,
		markdown: string,
	): Promise<string> {
		const scriptName = this.selectScript(file, metadata);
		const scriptCode = await this.scriptManager.loadScript(scriptName);

		// Create and inject AST conversion function into the sandbox
		const convertFn = this.createAstConverter(file.path);

		return await executeSandbox(scriptCode, markdown, convertFn);
	}

	private async runWithAstTransformer(
		file: TFile,
		markdown: string,
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
				enableCheckboxEnhancement: this.settings.enableCheckboxEnhancement ?? true,
			},
			embedEnvironment,
		);
	}

	/**
	 * Compile Typst file to the specified format
	 * @param typstPath Typst source file path
	 * @param format Output format (pdf/png/svg)
	 * @param silent Silent mode
	 * @returns Output file path
	 */
	async compileTypstFile(
		typstPath: string,
		format: "pdf" | "png" | "svg" = "pdf",
		silent = false,
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
				"The current storage adapter does not support automatic Typst compilation",
			);
		}

		// Resolve Typst CLI path
		let typstCliPath: string;
		try {
			typstCliPath = await this.pathResolver.resolveTypstPath(
				this.settings.typstCliPath,
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
		// For PNG format, use a folder to store multipage documents
		let outputPath: string;
		let fullOutputPath: string;

		if (format === "png" || format === "svg") {
			// PNG: create folder and generate folder/{n}.png
			const basePath = typstPath.replace(/\.typ$/, "");
			const folderPath = `${basePath}-pages`;

			// Ensure folder existence
			const folderExists =
				await this.app.vault.adapter.exists(folderPath);
			if (!folderExists) {
				await this.app.vault.createFolder(folderPath);
			}

			outputPath = `${folderPath}/{n}.${format}`;
			fullOutputPath = adapter.getFullPath(outputPath);
		} else {
			outputPath = typstPath.replace(/\.typ$/, `.${format}`);
			fullOutputPath = adapter.getFullPath(outputPath);
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
					new Notice(`Typst Compile Success: ${outputPath}`);
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
		maxEmbedDepth: number = this.settings.maxEmbedDepth,
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
					enableCheckboxEnhancement: this.settings.enableCheckboxEnhancement ?? true,
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

	private buildTypstPath(file: TFile): string {
		const extensionPattern = new RegExp(`\\.${file.extension}$`, "i");
		if (!extensionPattern.test(file.path)) {
			return `${file.path}.typ`;
		}
		return file.path.replace(extensionPattern, ".typ");
	}

	/**
	 * Write Typst content to a .typ file
	 * @param path File path
	 * @param content Typst content
	 */
	async writeTypstFile(path: string, content: string): Promise<void> {
		const existing = this.app.vault.getAbstractFileByPath(path);
		if (existing instanceof TFile) {
			await this.app.vault.modify(existing, content);
		} else {
			await this.app.vault.create(path, content);
		}
	}

	/**
	 * Get path resolver (for settings UI)
	 */
	getPathResolver(): TypstPathResolver {
		return this.pathResolver;
	}

	/**
	 * Get settings (for internal use)
	 */
	getSettings(): TypstSettings {
		return this.settings;
	}
}

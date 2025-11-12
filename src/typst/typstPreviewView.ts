/**
 * Typst Preview View
 * Real-time display of SVG rendered using WASM, with export options for PDF/PNG/SVG
 */

import {
	ItemView,
	Notice,
	Platform,
	TFile,
	WorkspaceLeaf,
	FileSystemAdapter,
} from "obsidian";
import type { TypstWasmRenderer } from "./typstWasmRenderer";
import type { TypstConverter } from "./typstConverter";
import { exec } from "child_process";
import { TypstPathResolver } from "./typstPathResolver";
import { TypstNotFoundError, TypstInvalidPathError } from "./typstErrors";
export const TYPST_PREVIEW_VIEW_TYPE = "typst-preview-view";

export class TypstPreviewView extends ItemView {
	private renderer: TypstWasmRenderer;
	private converter: TypstConverter;
	private sourceFile: TFile | null = null;
	private currentSvg: string = "";
	private readonly pathResolver: TypstPathResolver;

	// UI containers
	private previewContainer: HTMLElement;

	constructor(
		leaf: WorkspaceLeaf,
		renderer: TypstWasmRenderer,
		converter: TypstConverter
	) {
		super(leaf);
		this.renderer = renderer;
		this.converter = converter;
		this.pathResolver = new TypstPathResolver();
	}

	getViewType(): string {
		return TYPST_PREVIEW_VIEW_TYPE;
	}

	getDisplayText(): string {
		if (this.sourceFile) {
			return `Typst Preview: ${this.sourceFile.basename}`;
		}
		return "Typst Preview";
	}

	getIcon(): string {
		return "file-type";
	}

	async onOpen() {
		const container = this.containerEl.children[1];
		container.empty();
		container.addClass("typst-preview-view");

		// Create toolbar
		this.createToolbar(container);

		// Create preview container
		this.createPreviewContainer(container);
	}

	async onClose() {
		// Cleanup resources
		this.sourceFile = null;
		this.currentSvg = "";
	}

	/**
	 * Create toolbar (export buttons)
	 */
	private createToolbar(container: Element): void {
		// SVG export button
		this.addAction("image-file", "Export as SVG", () => this.exportAsSvg());

		// PDF export button
		this.addAction("file-text", "Export as PDF (CLI)", () =>
			this.exportAsPdf()
		);

		// PNG export button
		this.addAction("image", "Export as PNG (CLI)", () =>
			this.exportAsPng()
		);
	}

	/**
	 * Create preview container
	 */
	private createPreviewContainer(container: Element): void {
		this.previewContainer = container.createDiv({
			cls: "typst-preview-container",
		});

		// Initial placeholder
		this.showPlaceholder(
			"No preview available. Edit a Markdown file with 'bon-typst' tag."
		);
	}

	/**
	 * Show placeholder message
	 */
	private showPlaceholder(message: string): void {
		this.previewContainer.empty();
		this.previewContainer.createDiv({
			cls: "typst-preview-placeholder",
			text: message,
		});
	}

	/**
	 * Update preview content (WASM mode)
	 * @param file Source Markdown file
	 * @param typstCode Typst code
	 */
	public async updatePreview(file: TFile, typstCode: string): Promise<void> {
		this.sourceFile = file;

		// Show loading state
		this.previewContainer.empty();
		const loadingEl = this.previewContainer.createDiv({
			cls: "typst-preview-loading",
			text: "Rendering Typst with WASM...",
		});

		try {
			// Render SVG using WASM
			const svg = await this.renderer.renderToSVG(typstCode);
			this.currentSvg = svg;

			// Remove loading indicator
			loadingEl.remove();

			// Render SVG
			this.renderSvg(svg);

			// Update title
			this.updateTitle();
		} catch (error) {
			// Remove loading indicator
			loadingEl.remove();

			// Show error
			this.showError(error);
		}
	}

	/**
	 * Update preview content (WASM mode, fallback to CLI if failed)
	 * @param file Source Markdown file
	 * @param typstCode Typst code
	 * @param compileFormat CLI compilation format (used on fallback)
	 */
	public async updatePreviewWithFallback(
		file: TFile,
		typstCode: string,
		compileFormat: "pdf" | "png" | "svg" = "svg"
	): Promise<void> {
		this.sourceFile = file;

		// Show loading state
		this.previewContainer.empty();
		const loadingEl = this.previewContainer.createDiv({
			cls: "typst-preview-loading",
			text: "Rendering Typst with WASM...",
		});

		try {
			// Try rendering SVG with WASM
			const svg = await this.renderer.renderToSVG(typstCode);
			this.currentSvg = svg;

			// Remove loading indicator
			loadingEl.remove();

			// Render SVG
			this.renderSvg(svg);

			// Update title
			this.updateTitle();
		} catch (error) {
			// Check if it's a package-related error
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			const isPackageError =
				errorMessage.includes("package") ||
				errorMessage.includes("Registry");

			if (isPackageError) {
				// Package error: automatically fallback to CLI
				console.log(
					"WASM rendering failed due to package dependency, falling back to CLI compilation"
				);
				loadingEl.textContent = `WASM failed (package dependency), compiling with CLI...`;

				try {
					// Compile using CLI
					const typstPath = this.buildTypstPath(file);
					const outputPath = await this.converter.compileTypstFile(
						typstPath,
						compileFormat,
						true // silent
					);

					// Remove loading indicator
					loadingEl.remove();

					// Load compiled file
					await this.loadCompiledFile(outputPath, compileFormat);

					// Update title
					this.updateTitle();

					// Notify user about the fallback
					new Notice(
						"WASM rendering failed, used CLI compilation instead"
					);
				} catch (cliError) {
					// CLI compilation also failed
					loadingEl.remove();
					this.showError(cliError);
					new Notice(
						`CLI compilation also failed: ${
							cliError instanceof Error
								? cliError.message
								: String(cliError)
						}`
					);
				}
			} else {
				// Other errors: show directly
				loadingEl.remove();
				this.showError(error);
			}
		}
	}

	/**
	 * Update preview content from compiled file (CLI mode)
	 * @param file Source Markdown file
	 * @param outputPath Compiled output file path
	 * @param format Output format
	 */
	public async updatePreviewFromFile(
		file: TFile,
		outputPath: string,
		format: "pdf" | "png" | "svg"
	): Promise<void> {
		this.sourceFile = file;

		// Show loading state
		this.previewContainer.empty();
		const loadingEl = this.previewContainer.createDiv({
			cls: "typst-preview-loading",
			text: `Loading ${format.toUpperCase()}...`,
		});

		try {
			// Load file according to format
			await this.loadCompiledFile(outputPath, format);

			// Remove loading indicator
			loadingEl.remove();

			// Update title
			this.updateTitle();
		} catch (error) {
			// Remove loading indicator
			loadingEl.remove();

			// Show error
			this.showError(error);
		}
	}

	/**
	 * Load compiled file
	 */
	private async loadCompiledFile(
		outputPath: string,
		format: "pdf" | "png" | "svg"
	): Promise<void> {
		this.previewContainer.empty();

		if (format === "png") {
			// PNG: could be a folder (multi-page) or a single file
			const abstractFile =
				this.app.vault.getAbstractFileByPath(outputPath);

			if (!abstractFile) {
				throw new Error(`Output path not found: ${outputPath}`);
			}

			// Check if file or folder
			if (abstractFile instanceof TFile) {
				// Single PNG file
				const resourcePath = this.app.vault.adapter.getResourcePath(
					abstractFile.path
				);
				const img = this.previewContainer.createEl("img", {
					cls: "typst-preview-image",
				});
				img.src = resourcePath;
			} else {
				// PNG folder: load all pages
				const folder = this.app.vault.getAbstractFileByPath(outputPath);
				if (!folder) {
					throw new Error(
						`PNG pages folder not found: ${outputPath}`
					);
				}

				// Get all PNG files in the folder
				const files = this.app.vault
					.getFiles()
					.filter(
						(file) =>
							file.path.startsWith(outputPath + "/") &&
							file.extension === "png"
					);

				// Sort by number in filename (1.png, 2.png, 3.png, ...)
				files.sort((a, b) => {
					const numA = parseInt(a.basename, 10);
					const numB = parseInt(b.basename, 10);
					return numA - numB;
				});

				if (files.length === 0) {
					throw new Error(
						`No PNG pages found in folder: ${outputPath}`
					);
				}

				// Create vertically stacked page container
				const pagesContainer = this.previewContainer.createDiv({
					cls: "typst-preview-pages",
				});

				// Create image element for each page
				for (const file of files) {
					const resourcePath = this.app.vault.adapter.getResourcePath(
						file.path
					);
					const pageWrapper = pagesContainer.createDiv({
						cls: "typst-preview-page-wrapper",
					});

					const pageNumber = pageWrapper.createDiv({
						cls: "typst-preview-page-number",
						text: `Page ${file.basename}`,
					});

					const img = pageWrapper.createEl("img", {
						cls: "typst-preview-image",
					});
					img.src = resourcePath;
				}
			}
		} else {
			// SVG and PDF: should be a file
			const file = this.app.vault.getAbstractFileByPath(outputPath);
			console.log(outputPath);
			if (!(file instanceof TFile)) {
				throw new Error(`Output file not found: ${outputPath}`);
			}

			if (format === "svg") {
				// SVG: read and render directly
				const svgContent = await this.app.vault.read(file);
				this.currentSvg = svgContent;
				this.previewContainer.innerHTML = svgContent;
			} else if (format === "pdf") {
				// PDF: embed as iframe
				const resourcePath = this.app.vault.adapter.getResourcePath(
					file.path
				);
				const iframe = this.previewContainer.createEl("iframe", {
					cls: "typst-preview-pdf",
				});
				iframe.src = resourcePath;
			}
		}
	}

	/**
	 * Render SVG to container
	 */
	private renderSvg(svg: string): void {
		this.previewContainer.empty();
		this.previewContainer.innerHTML = svg;
	}

	/**
	 * Show error message
	 */
	private showError(error: unknown): void {
		this.previewContainer.empty();

		const errorContainer = this.previewContainer.createDiv({
			cls: "typst-preview-error",
		});

		errorContainer.createDiv({
			cls: "typst-error-title",
			text: "⚠️ Typst Rendering Error",
		});

		const message = error instanceof Error ? error.message : String(error);
		errorContainer.createEl("pre", {
			cls: "typst-error-message",
			text: message,
		});
	}

	/**
	 * Update view title
	 */
	private updateTitle(): void {
		// @ts-expect-error - titleContainerEl is not typed
		(this.titleContainerEl as any).setText(this.getDisplayText());
	}

	/**
	 * Export as SVG
	 */
	private async exportAsSvg(): Promise<void> {
		if (!this.currentSvg || !this.sourceFile) {
			new Notice("No content to export");
			return;
		}

		try {
			const svgPath = this.buildExportPath(this.sourceFile, "svg");
			await this.app.vault.adapter.write(svgPath, this.currentSvg);
			new Notice(`SVG exported: ${svgPath}`);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : String(error);
			new Notice(`SVG export failed: ${message}`);
		}
	}

	/**
	 * Export as PDF (using Typst CLI)
	 */
	private async exportAsPdf(): Promise<void> {
		if (!this.sourceFile) {
			new Notice("No source file");
			return;
		}

		try {
			const typstPath = this.buildTypstPath(this.sourceFile);
			const pdfPath = this.buildExportPath(this.sourceFile, "pdf");

			// Compile with Typst CLI
			await this.compileWithCli(typstPath, pdfPath, "pdf");

			new Notice(`PDF exported: ${pdfPath}`);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : String(error);
			new Notice(`PDF export failed: ${message}`);
		}
	}

	/**
	 * Export as PNG (using Typst CLI)
	 */
	private async exportAsPng(): Promise<void> {
		if (!this.sourceFile) {
			new Notice("No source file");
			return;
		}

		try {
			const typstPath = this.buildTypstPath(this.sourceFile);
			const pngPath = this.buildExportPath(this.sourceFile, "png");

			// Compile with Typst CLI
			await this.compileWithCli(typstPath, pngPath, "png");

			new Notice(`PNG exported: ${pngPath}`);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : String(error);
			new Notice(`PNG export failed: ${message}`);
		}
	}

	/**
	 * Compile file using Typst CLI
	 */
	private async compileWithCli(
		typstPath: string,
		outputPath: string,
		format: "pdf" | "png"
	): Promise<void> {
		// Early check: CLI compilation only available on desktop
		if (!Platform.isDesktopApp) {
			throw new Error(
				"CLI compilation is only available on desktop. Use WASM preview on mobile."
			);
		}

		const adapter = this.app.vault.adapter;
		if (!(adapter instanceof FileSystemAdapter)) {
			throw new Error("File system adapter not available");
		}

		// Resolve Typst CLI path
		let typstCliPath: string;
		try {
			const settings = this.converter.getSettings();
			typstCliPath = await this.pathResolver.resolveTypstPath(
				settings.typstCliPath
			);
		} catch (error) {
			if (error instanceof TypstNotFoundError) {
				throw new Error(error.toUserMessage());
			}
			if (error instanceof TypstInvalidPathError) {
				throw new Error(error.toUserMessage());
			}
			throw error;
		}

		const fullTypstPath = adapter.getFullPath(typstPath);
		const vaultRoot = adapter.getFullPath("");

		// PNG format uses folder to store multipage documents
		let finalOutputPath = outputPath;
		if (format === "png") {
			// outputPath should already be folder path (from buildExportPath)
			// Make sure the folder exists
			const folderExists = await this.app.vault.adapter.exists(
				outputPath
			);
			if (!folderExists) {
				await this.app.vault.createFolder(outputPath);
			}

			// Construct output path: folder/{n}.png
			finalOutputPath = `${outputPath}/{n}.png`;
		}

		const fullOutputPath = adapter.getFullPath(finalOutputPath);

		await new Promise<void>((resolve, reject) => {
			// Use resolved path with proper quoting
			const command = `"${typstCliPath}" compile --root "${vaultRoot}" "${fullTypstPath}" "${fullOutputPath}"`;

			exec(command, (error: any, stdout: string, stderr: string) => {
				if (error) {
					const message = stderr || stdout || error.message;
					reject(new Error(message));
					return;
				}
				resolve();
			});
		});
	}

	/**
	 * Construct Typst file path
	 */
	private buildTypstPath(file: TFile): string {
		const extensionPattern = new RegExp(`\\.${file.extension}$`, "i");
		if (!extensionPattern.test(file.path)) {
			return `${file.path}.typ`;
		}
		return file.path.replace(extensionPattern, ".typ");
	}

	/**
	 * Construct export file path
	 * Returns folder path for PNG, file path for other formats
	 */
	private buildExportPath(file: TFile, extension: string): string {
		const extensionPattern = new RegExp(`\\.${file.extension}$`, "i");
		const basePath = extensionPattern.test(file.path)
			? file.path.replace(extensionPattern, "")
			: file.path;

		if (extension === "png") {
			// PNG: return folder path
			return `${basePath}-pages`;
		} else {
			// Other formats: return file path
			return `${basePath}.${extension}`;
		}
	}
}

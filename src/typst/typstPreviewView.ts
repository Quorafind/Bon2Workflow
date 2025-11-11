/**
 * Typst 预览视图
 * 实时显示 WASM 渲染的 SVG，并提供 PDF/PNG/SVG 导出功能
 */

import { ItemView, Notice, TFile, WorkspaceLeaf } from "obsidian";
import type { TypstWasmRenderer } from "./typstWasmRenderer";
import type { TypstConverter } from "./typstConverter";

export const TYPST_PREVIEW_VIEW_TYPE = "typst-preview-view";

export class TypstPreviewView extends ItemView {
	private renderer: TypstWasmRenderer;
	private converter: TypstConverter;
	private sourceFile: TFile | null = null;
	private currentTypstCode: string = "";
	private currentSvg: string = "";

	// UI 容器
	private previewContainer: HTMLElement;
	private toolbarContainer: HTMLElement;

	constructor(
		leaf: WorkspaceLeaf,
		renderer: TypstWasmRenderer,
		converter: TypstConverter
	) {
		super(leaf);
		this.renderer = renderer;
		this.converter = converter;
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

		// 创建工具栏
		this.createToolbar(container);

		// 创建预览容器
		this.createPreviewContainer(container);
	}

	async onClose() {
		// 清理资源
		this.sourceFile = null;
		this.currentTypstCode = "";
		this.currentSvg = "";
	}

	/**
	 * 创建工具栏（导出按钮）
	 */
	private createToolbar(container: Element): void {
		this.toolbarContainer = container.createDiv({
			cls: "typst-preview-toolbar",
		});

		// SVG 导出按钮
		this.createToolbarButton(
			this.toolbarContainer,
			"image-file",
			"Export as SVG",
			() => this.exportAsSvg()
		);

		// PDF 导出按钮
		this.createToolbarButton(
			this.toolbarContainer,
			"file-text",
			"Export as PDF (CLI)",
			() => this.exportAsPdf()
		);

		// PNG 导出按钮
		this.createToolbarButton(
			this.toolbarContainer,
			"image",
			"Export as PNG (CLI)",
			() => this.exportAsPng()
		);
	}

	/**
	 * 创建工具栏按钮
	 */
	private createToolbarButton(
		container: HTMLElement,
		icon: string,
		tooltip: string,
		onClick: () => void
	): void {
		const button = container.createEl("button", {
			cls: "typst-toolbar-button",
			attr: { "aria-label": tooltip },
		});

		button.innerHTML = `<svg class="svg-icon"><use href="#lucide-${icon}"></use></svg>`;
		button.addEventListener("click", onClick);
	}

	/**
	 * 创建预览容器
	 */
	private createPreviewContainer(container: Element): void {
		this.previewContainer = container.createDiv({
			cls: "typst-preview-container",
		});

		// 初始提示
		this.showPlaceholder("No preview available. Edit a Markdown file with 'bon-typst' tag.");
	}

	/**
	 * 显示占位符消息
	 */
	private showPlaceholder(message: string): void {
		this.previewContainer.empty();
		this.previewContainer.createDiv({
			cls: "typst-preview-placeholder",
			text: message,
		});
	}

	/**
	 * 更新预览内容（由 TypstConverter 调用）
	 * @param file 源 Markdown 文件
	 * @param typstCode Typst 代码
	 */
	public async updatePreview(file: TFile, typstCode: string): Promise<void> {
		this.sourceFile = file;
		this.currentTypstCode = typstCode;

		// 显示加载状态
		this.previewContainer.empty();
		const loadingEl = this.previewContainer.createDiv({
			cls: "typst-preview-loading",
			text: "Rendering Typst...",
		});

		try {
			// 使用 WASM 渲染 SVG
			const svg = await this.renderer.renderToSVG(typstCode);
			this.currentSvg = svg;

			// 移除加载提示
			loadingEl.remove();

			// 渲染 SVG
			this.renderSvg(svg);

			// 更新标题
			this.updateTitle();
		} catch (error) {
			// 移除加载提示
			loadingEl.remove();

			// 显示错误
			this.showError(error);
		}
	}

	/**
	 * 渲染 SVG 到容器
	 */
	private renderSvg(svg: string): void {
		this.previewContainer.empty();
		this.previewContainer.innerHTML = svg;
	}

	/**
	 * 显示错误信息
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
	 * 更新视图标题
	 */
	private updateTitle(): void {
		// 触发 Obsidian 更新标题
		this.leaf.updateHeader();
	}

	/**
	 * 导出为 SVG
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
	 * 导出为 PDF（使用 Typst CLI）
	 */
	private async exportAsPdf(): Promise<void> {
		if (!this.sourceFile) {
			new Notice("No source file");
			return;
		}

		try {
			const typstPath = this.buildTypstPath(this.sourceFile);
			const pdfPath = this.buildExportPath(this.sourceFile, "pdf");

			// 调用 Typst CLI 编译
			await this.compileWithCli(typstPath, pdfPath, "pdf");

			new Notice(`PDF exported: ${pdfPath}`);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : String(error);
			new Notice(`PDF export failed: ${message}`);
		}
	}

	/**
	 * 导出为 PNG（使用 Typst CLI）
	 */
	private async exportAsPng(): Promise<void> {
		if (!this.sourceFile) {
			new Notice("No source file");
			return;
		}

		try {
			const typstPath = this.buildTypstPath(this.sourceFile);
			const pngPath = this.buildExportPath(this.sourceFile, "png");

			// 调用 Typst CLI 编译
			await this.compileWithCli(typstPath, pngPath, "png");

			new Notice(`PNG exported: ${pngPath}`);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : String(error);
			new Notice(`PNG export failed: ${message}`);
		}
	}

	/**
	 * 使用 Typst CLI 编译文件
	 */
	private async compileWithCli(
		typstPath: string,
		outputPath: string,
		format: "pdf" | "png"
	): Promise<void> {
		const { exec } = require("child_process");
		const { FileSystemAdapter } = require("obsidian");

		const adapter = this.app.vault.adapter;
		if (!(adapter instanceof FileSystemAdapter)) {
			throw new Error("File system adapter not available");
		}

		const fullTypstPath = adapter.getFullPath(typstPath);
		const fullOutputPath = adapter.getFullPath(outputPath);
		const vaultRoot = adapter.getFullPath("");

		await new Promise<void>((resolve, reject) => {
			// 使用 --root 参数允许访问 vault 内所有文件
			const command = `typst compile --root "${vaultRoot}" "${fullTypstPath}" "${fullOutputPath}"`;

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
	 * 构建 Typst 文件路径
	 */
	private buildTypstPath(file: TFile): string {
		const extensionPattern = new RegExp(`\\.${file.extension}$`, "i");
		if (!extensionPattern.test(file.path)) {
			return `${file.path}.typ`;
		}
		return file.path.replace(extensionPattern, ".typ");
	}

	/**
	 * 构建导出文件路径
	 */
	private buildExportPath(file: TFile, extension: string): string {
		const extensionPattern = new RegExp(`\\.${file.extension}$`, "i");
		if (!extensionPattern.test(file.path)) {
			return `${file.path}.${extension}`;
		}
		return file.path.replace(extensionPattern, `.${extension}`);
	}
}

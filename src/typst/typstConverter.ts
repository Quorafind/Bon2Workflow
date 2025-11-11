import {
	App,
	CachedMetadata,
	FileSystemAdapter,
	Notice,
	TFile,
} from "obsidian";
import { exec } from "child_process";
import { TypstSettings } from "./typstSettings";
import { TypstScriptManager } from "./typstScriptManager";
import { executeSandbox } from "./typstSandbox";
import { markdownToTypst, type EmbedEnvironment } from "./transformer";

interface ConvertOptions {
	silent?: boolean;
}

export interface MarkdownConvertOptions {
	transformMode?: "ast" | "script";
	scriptName?: string;
	maxEmbedDepth?: number;
	currentFile?: string;
}

/**
 * 预览更新回调函数
 * @param file 源文件
 * @param typstCode 转换后的 Typst 代码
 */
export type PreviewUpdateCallback = (
	file: TFile,
	typstCode: string
) => Promise<void>;

export class TypstConverter {
	private readonly triggerTagSet: Set<string>;
	private previewUpdateCallback: PreviewUpdateCallback | null = null;

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
	}

	/**
	 * 设置预览更新回调
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

	selectScript(file: TFile, metadata: CachedMetadata | null): string {
		const frontmatter = metadata?.frontmatter ?? {};
		const frontmatterScript = frontmatter["typst-script"];
		if (typeof frontmatterScript === "string" && frontmatterScript.trim()) {
			return this.normalizeScriptName(frontmatterScript);
		}

		const folderPath = file.parent?.path ?? "";
		const mapping = this.settings.templateMapping ?? {};

		if (folderPath && mapping[folderPath]) {
			return this.normalizeScriptName(mapping[folderPath]);
		}

		return "default";
	}

	async convertFile(
		file: TFile,
		metadata?: CachedMetadata | null,
		options: ConvertOptions = {}
	): Promise<void> {
		const cache = metadata ?? this.app.metadataCache.getFileCache(file);

		try {
			const markdown = await this.app.vault.read(file);
			const typstContent = await this.convertMarkdown(markdown, {
				transformMode: this.settings.transformMode,
				scriptName: this.selectScript(file, cache),
				maxEmbedDepth: this.settings.maxEmbedDepth,
				currentFile: file.path,
			});
			const typstPath = this.buildTypstPath(file);

			await this.writeTypstFile(typstPath, typstContent);

			if (!options.silent) {
				new Notice(`Typst 文件已更新: ${typstPath}`);
			}

			// 触发预览更新
			if (this.previewUpdateCallback) {
				try {
					await this.previewUpdateCallback(file, typstContent);
				} catch (error) {
					console.error("Preview update failed:", error);
				}
			}

			if (this.settings.autoCompile) {
				await this.compileTypstFile(typstPath, options.silent);
			}
		} catch (error) {
			const message =
				error instanceof Error ? error.message : String(error);
			new Notice(`Typst 转换失败: ${message}`);
			throw error;
		}
	}

	/**
	 * 将 Markdown 字符串转换为 Typst 格式
	 * 这是一个公共方法，可供 API 层调用
	 *
	 * @param markdown - Markdown 内容
	 * @param options - 转换选项
	 * @returns Promise，解析为 Typst 字符串
	 */
	public async convertMarkdown(
		markdown: string,
		options: MarkdownConvertOptions = {}
	): Promise<string> {
		const {
			transformMode = this.settings.transformMode,
			scriptName = "default",
			maxEmbedDepth = this.settings.maxEmbedDepth,
			currentFile,
		} = options;

		if (transformMode === "script") {
			const scriptCode = await this.scriptManager.loadScript(scriptName);
			return executeSandbox(scriptCode, markdown);
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
				},
				embedEnvironment
			);
		}
	}

	private async runWithScriptEngine(
		file: TFile,
		metadata: CachedMetadata | null,
		markdown: string
	): Promise<string> {
		const scriptName = this.selectScript(file, metadata);
		const scriptCode = await this.scriptManager.loadScript(scriptName);
		return executeSandbox(scriptCode, markdown);
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
			},
			embedEnvironment
		);
	}

	async compileTypstFile(typstPath: string, silent = false): Promise<void> {
		const adapter = this.app.vault.adapter;
		if (!(adapter instanceof FileSystemAdapter)) {
			new Notice("当前存储类型不支持自动编译 Typst 文件");
			return;
		}

		const fullPath = adapter.getFullPath(typstPath);
		// 获取 vault 根目录作为 Typst 项目根目录
		// adapter.getFullPath("") 返回 vault 根目录的绝对路径
		const vaultRoot = adapter.getFullPath("");

		await new Promise<void>((resolve, reject) => {
			// 添加 --root 参数，允许访问 vault 内所有文件
			const command = `typst compile --root "${vaultRoot}" "${fullPath}"`;
			exec(command, (error, stdout, stderr) => {
				if (error) {
					const message = stderr || stdout || error.message;
					new Notice(`Typst 编译失败: ${message}`);
					reject(error);
					return;
				}

				if (!silent) {
					new Notice(`Typst 编译完成: ${typstPath}`);
				}
				resolve();
			});
		});
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

	private async writeTypstFile(path: string, content: string): Promise<void> {
		const existing = this.app.vault.getAbstractFileByPath(path);
		if (existing instanceof TFile) {
			await this.app.vault.modify(existing, content);
		} else {
			await this.app.vault.create(path, content);
		}
	}
}

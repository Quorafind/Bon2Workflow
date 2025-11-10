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

interface ConvertOptions {
	silent?: boolean;
}

export class TypstConverter {
	private readonly triggerTagSet: Set<string>;

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
		const scriptName = this.selectScript(file, cache);

		try {
			const markdown = await this.app.vault.read(file);
			const scriptCode = await this.scriptManager.loadScript(scriptName);
			const typstContent = executeSandbox(scriptCode, markdown);
			const typstPath = this.buildTypstPath(file);

			await this.writeTypstFile(typstPath, typstContent);

			if (!options.silent) {
				new Notice(`Typst 文件已更新: ${typstPath}`);
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

	async compileTypstFile(
		typstPath: string,
		silent = false
	): Promise<void> {
		const adapter = this.app.vault.adapter;
		if (!(adapter instanceof FileSystemAdapter)) {
			new Notice("当前存储类型不支持自动编译 Typst 文件");
			return;
		}

		const fullPath = adapter.getFullPath(typstPath);
		await new Promise<void>((resolve, reject) => {
			const command = `typst compile "${fullPath}"`;
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


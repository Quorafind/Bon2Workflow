import type { App, TFile } from "obsidian";
import type { ConvertOptions, TypstAPIInterface } from "./types";
import type { TypstConverter } from "./typstConverter";
import type { TypstScriptManager } from "./typstScriptManager";

/**
 * Typst 转换 API 封装层
 * 提供标准化的公共 API 接口，用于在全局作用域中暴露 Typst 转换能力
 */
export class TypstAPI implements TypstAPIInterface {
	constructor(
		private converter: TypstConverter,
		private scriptManager: TypstScriptManager,
		private app: App
	) {}

	/**
	 * 将 Markdown 字符串转换为 Typst 格式（同步）
	 *
	 * ⚠️ **DEPRECATED**: 由于底层依赖异步操作（unified processor），此方法无法提供真正的同步转换。
	 * 请使用 `convertAsync()` 方法代替。
	 *
	 * @deprecated 使用 convertAsync() 代替
	 * @param markdown - 要转换的 Markdown 内容
	 * @param options - 转换配置选项
	 * @returns 转换后的 Typst 字符串
	 * @throws 始终抛出错误，引导使用 convertAsync()
	 *
	 * @example
	 * ```typescript
	 * // ❌ 错误用法（已废弃）
	 * // const typst = window.bon.typst.convert("# Hello");
	 *
	 * // ✅ 正确用法（使用异步方法）
	 * const typst = await window.bon.typst.convertAsync("# Hello");
	 * console.log(typst); // "= Hello"
	 *
	 * // 使用选项
	 * const typst = await window.bon.typst.convertAsync(
	 *   "# Title\n\n[[link]] and ==highlight==",
	 *   { transformMode: 'ast', maxEmbedDepth: 5 }
	 * );
	 * ```
	 */
	convert(markdown: string, options?: ConvertOptions): string {
		throw new Error(
			"[Typst API] The synchronous convert() method is deprecated and not supported.\n" +
				"Reason: The underlying markdown parser (unified/remark) requires async operations.\n" +
				"Solution: Please use convertAsync() instead.\n" +
				"Example: await window.bon.typst.convertAsync(markdown, options);\n" +
				"See documentation: https://github.com/your-repo/docs#typst-api"
		);
	}

	/**
	 * 异步转换 Markdown 内容或文件（支持文件和字符串输入）
	 *
	 * @param input - Markdown 字符串或 Obsidian TFile 对象
	 * @param options - 转换配置选项
	 * @returns Promise，解析为转换后的 Typst 字符串
	 * @throws 如果转换失败、文件读取失败或配置无效
	 *
	 * @example
	 * ```typescript
	 * // 转换字符串
	 * const typst = await window.bon.typst.convertAsync("# Hello");
	 *
	 * // 转换文件
	 * const file = app.workspace.getActiveFile();
	 * if (file) {
	 *   const typst = await window.bon.typst.convertAsync(file, {
	 *     transformMode: 'ast',
	 *     autoCompile: true
	 *   });
	 * }
	 *
	 * // 在 DataviewJS 中使用
	 * const files = dv.pages("#report").file;
	 * for (const file of files) {
	 *   const typst = await window.bon.typst.convertAsync(file);
	 *   console.log(typst);
	 * }
	 * ```
	 */
	async convertAsync(
		input: string | TFile,
		options?: ConvertOptions
	): Promise<string> {
		console.debug(
			"[Typst API] convertAsync() called with input type:",
			typeof input === "string" ? "string" : "TFile",
			"options:",
			options
		);

		try {
			// 处理字符串输入
			if (typeof input === "string") {
				return await this.convertString(input, options);
			}

			// 处理 TFile 输入
			if (this.isTFile(input)) {
				return await this.convertFile(input, options);
			}

			throw new Error(
				"[Typst API] Invalid input: must be a string or TFile object"
			);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : String(error);
			console.error("[Typst API] Conversion failed:", message);
			throw error;
		}
	}

	/**
	 * 获取所有可用的 Typst 转换脚本列表
	 *
	 * @returns Promise，解析为脚本名称数组
	 *
	 * @example
	 * ```typescript
	 * const scripts = await window.bon.typst.listScripts();
	 * console.log(scripts); // ["default", "academic", "resume"]
	 *
	 * // 使用返回的脚本名称
	 * const typst = await window.bon.typst.convertAsync(markdown, {
	 *   transformMode: 'script',
	 *   scriptName: scripts[0]
	 * });
	 * ```
	 */
	async listScripts(): Promise<string[]> {
		console.debug("[Typst API] listScripts() called");

		try {
			return await this.scriptManager.listScripts();
		} catch (error) {
			const message =
				error instanceof Error ? error.message : String(error);
			console.error("[Typst API] Failed to list scripts:", message);
			throw new Error(`[Typst API] Failed to list scripts: ${message}`);
		}
	}

	/**
	 * 转换字符串（内部方法）
	 */
	private async convertString(
		markdown: string,
		options?: ConvertOptions
	): Promise<string> {
		// 边界检查
		if (markdown.length === 0) {
			console.warn("[Typst API] Empty markdown string provided");
			return "";
		}

		// 验证配置
		this.validateOptions(options);

		// 调用转换器
		return await this.converter.convertMarkdown(markdown, {
			transformMode: options?.transformMode,
			scriptName: options?.scriptName,
			maxEmbedDepth: options?.maxEmbedDepth,
			currentFile: undefined, // 字符串模式下没有当前文件
		});
	}

	/**
	 * 转换文件（内部方法）
	 *
	 * 行为说明：
	 * - 如果指定 autoCompile=true，将调用 converter.convertFile() 执行完整的转换+编译流程（有副作用：写入 .typ 和 .pdf 文件）
	 * - 否则只进行纯转换，返回 Typst 字符串（无副作用）
	 */
	private async convertFile(
		file: TFile,
		options?: ConvertOptions
	): Promise<string> {
		// 边界检查
		if (file.extension.toLowerCase() !== "md") {
			throw new Error(
				`[Typst API] Invalid file type: "${file.extension}". Only Markdown (.md) files are supported.`
			);
		}

		// 验证配置
		this.validateOptions(options);

		// 获取元数据（用于脚本选择和转换）
		const metadata = this.app.metadataCache.getFileCache(file);

		// 场景 1：需要自动编译（有副作用：写入文件和编译）
		if (options?.autoCompile) {
			const silent = options.silent ?? false;

			// 步骤 1：调用底层的 convertFile()，写入 .typ 文件
			await this.converter.convertFile(file, metadata, { silent });

			// 步骤 2：手动触发编译（因为 autoCompile 参数不在 converter 的 settings 中）
			const typstPath = file.path.replace(/\.md$/, ".typ");
			try {
				await this.converter.compileTypstFile(typstPath, silent);
			} catch (error) {
				const message =
					error instanceof Error ? error.message : String(error);
				console.error(
					`[Typst API] Compilation failed for "${typstPath}":`,
					message
				);
				// 编译失败不抛出异常，因为转换本身已成功
				if (!silent) {
					// Notice 已在 compileTypstFile 中显示，这里只记录日志
				}
			}

			// 步骤 3：读取生成的 .typ 文件内容并返回
			try {
				return await this.app.vault.adapter.read(typstPath);
			} catch (error) {
				const message =
					error instanceof Error ? error.message : String(error);
				throw new Error(
					`[Typst API] Failed to read generated Typst file "${typstPath}": ${message}`
				);
			}
		}

		// 场景 2：仅转换，不写入文件（无副作用）
		// 读取文件内容
		let markdown: string;
		try {
			markdown = await this.app.vault.read(file);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : String(error);
			throw new Error(
				`[Typst API] Failed to read file "${file.path}": ${message}`
			);
		}

		// 调用转换器
		return await this.converter.convertMarkdown(markdown, {
			transformMode: options?.transformMode,
			scriptName: options?.scriptName,
			maxEmbedDepth: options?.maxEmbedDepth,
			currentFile: file.path,
		});
	}

	/**
	 * 验证转换选项（内部方法）
	 */
	private validateOptions(options?: ConvertOptions): void {
		if (!options) return;

		// 验证 transformMode
		if (options.transformMode) {
			if (!["ast", "script"].includes(options.transformMode)) {
				throw new Error(
					`[Typst API] Invalid transformMode: "${options.transformMode}". Expected "ast" or "script".`
				);
			}
		}

		// 验证 maxEmbedDepth
		if (
			options.maxEmbedDepth !== undefined &&
			(typeof options.maxEmbedDepth !== "number" ||
				options.maxEmbedDepth < 0)
		) {
			throw new Error(
				`[Typst API] Invalid maxEmbedDepth: must be a non-negative number.`
			);
		}

		// 验证 scriptName（仅警告，不阻止）
		if (
			options.scriptName &&
			options.transformMode !== "script" &&
			options.transformMode !== undefined
		) {
			console.warn(
				`[Typst API] scriptName is specified but transformMode is not "script". scriptName will be ignored.`
			);
		}
	}

	/**
	 * 检查对象是否为 TFile（内部方法）
	 */
	private isTFile(obj: unknown): obj is TFile {
		return (
			obj !== null &&
			typeof obj === "object" &&
			"path" in obj &&
			"extension" in obj &&
			"vault" in obj
		);
	}
}

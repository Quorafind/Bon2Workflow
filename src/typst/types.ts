import type { TFile } from "obsidian";

/**
 * Typst 转换配置选项
 */
export interface ConvertOptions {
	/**
	 * 转换引擎模式
	 * - `ast`: 使用内置 AST 转换器（推荐，支持完整的 Obsidian 语法）
	 * - `script`: 使用自定义 JavaScript 脚本
	 * @default "ast"
	 */
	transformMode?: "ast" | "script";

	/**
	 * 自定义脚本名称（仅在 transformMode 为 "script" 时有效）
	 * @example "default", "academic", "resume"
	 */
	scriptName?: string;

	/**
	 * 嵌入内容的最大递归深度（用于处理 ![[嵌入文件]]）
	 * @default 5
	 */
	maxEmbedDepth?: number;

	/**
	 * 静默模式（不显示通知）
	 * @default false
	 */
	silent?: boolean;

	/**
	 * 转换后是否自动编译 Typst 文件为 PDF（需要本地安装 typst CLI）
	 * @default false
	 */
	autoCompile?: boolean;
}

/**
 * Typst 全局 API 接口定义
 */
export interface TypstAPIInterface {
	/**
	 * 将 Markdown 字符串转换为 Typst 格式（同步）
	 *
	 * @param markdown - 要转换的 Markdown 内容
	 * @param options - 转换配置选项
	 * @returns 转换后的 Typst 字符串
	 * @throws 如果转换失败或配置无效
	 *
	 * @example
	 * ```typescript
	 * // 基础用法
	 * const typst = window.bon.typst.convert("# Hello\n\nThis is **bold**.");
	 * console.log(typst); // "= Hello\n\nThis is *bold*."
	 *
	 * // 使用 AST 模式（推荐）
	 * const typst = window.bon.typst.convert(
	 *   "# Title\n\n[[link]] and ==highlight==",
	 *   { transformMode: 'ast' }
	 * );
	 *
	 * // 使用自定义脚本
	 * const typst = window.bon.typst.convert(
	 *   "# Title",
	 *   { transformMode: 'script', scriptName: 'academic' }
	 * );
	 * ```
	 */
	convert(markdown: string, options?: ConvertOptions): string;

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
	convertAsync(
		input: string | TFile,
		options?: ConvertOptions
	): Promise<string>;

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
	 * const typst = window.bon.typst.convert(markdown, {
	 *   transformMode: 'script',
	 *   scriptName: scripts[0]
	 * });
	 * ```
	 */
	listScripts(): Promise<string[]>;
}

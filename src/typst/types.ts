import type { TFile } from "obsidian";

/**
 * Typst conversion configuration options
 */
export interface ConvertOptions {
	/**
	 * Transformation engine mode
	 * - `ast`: Use built-in AST transformer (recommended, supports full Obsidian syntax)
	 * - `script`: Use custom JavaScript script
	 * @default "ast"
	 */
	transformMode?: "ast" | "script";

	/**
	 * Custom script name (only valid when transformMode is "script")
	 * @example "default", "academic", "resume"
	 */
	scriptName?: string;

	/**
	 * Maximum recursion depth for embeds (for handling ![[embedded file]])
	 * @default 5
	 */
	maxEmbedDepth?: number;

	/**
	 * Silent mode (no notifications)
	 * @default false
	 */
	silent?: boolean;

	/**
	 * Automatically compile the Typst file to PDF after conversion (requires Typst CLI installed locally)
	 * @default false
	 */
	autoCompile?: boolean;
}

/**
 * Typst global API interface definition
 */
export interface TypstAPIInterface {
	/**
	 * Synchronously convert a Markdown string to Typst format
	 *
	 * @param markdown - The Markdown content to convert
	 * @param options - Conversion options
	 * @returns The converted Typst string
	 * @throws If conversion fails or options are invalid
	 *
	 * @example
	 * ```typescript
	 * // Basic usage
	 * const typst = window.bon.typst.convert("# Hello\n\nThis is **bold**.");
	 * console.log(typst); // "= Hello\n\nThis is *bold*."
	 *
	 * // Use AST mode (recommended)
	 * const typst = window.bon.typst.convert(
	 *   "# Title\n\n[[link]] and ==highlight==",
	 *   { transformMode: 'ast' }
	 * );
	 *
	 * // Use custom script
	 * const typst = window.bon.typst.convert(
	 *   "# Title",
	 *   { transformMode: 'script', scriptName: 'academic' }
	 * );
	 * ```
	 */
	convert(markdown: string, options?: ConvertOptions): string;

	/**
	 * Asynchronously convert Markdown content or file (supports file and string input)
	 *
	 * @param input - Markdown string or Obsidian TFile object
	 * @param options - Conversion options
	 * @returns Promise, resolves to the converted Typst string
	 * @throws If conversion fails, file reading fails, or options are invalid
	 *
	 * @example
	 * ```typescript
	 * // Convert string
	 * const typst = await window.bon.typst.convertAsync("# Hello");
	 *
	 * // Convert file
	 * const file = app.workspace.getActiveFile();
	 * if (file) {
	 *   const typst = await window.bon.typst.convertAsync(file, {
	 *     transformMode: 'ast',
	 *     autoCompile: true
	 *   });
	 * }
	 *
	 * // Use in DataviewJS
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
	 * Get a list of all available Typst conversion scripts
	 *
	 * @returns Promise resolving to array of script names
	 *
	 * @example
	 * ```typescript
	 * const scripts = await window.bon.typst.listScripts();
	 * console.log(scripts); // ["default", "academic", "resume"]
	 *
	 * // Use the returned script names
	 * const typst = window.bon.typst.convert(markdown, {
	 *   transformMode: 'script',
	 *   scriptName: scripts[0]
	 * });
	 * ```
	 */
	listScripts(): Promise<string[]>;
}

import type { App, TFile } from "obsidian";
import type { ConvertOptions, TypstAPIInterface } from "./types";
import type { TypstConverter } from "./typstConverter";
import type { TypstScriptManager } from "./typstScriptManager";

/**
 * Typst conversion API wrapper.
 * Provides a standardized public API interface to expose Typst conversion capabilities globally.
 */
export class TypstAPI implements TypstAPIInterface {
	constructor(
		private converter: TypstConverter,
		private scriptManager: TypstScriptManager,
		private app: App
	) {}

	/**
	 * Convert a Markdown string to Typst format (synchronous)
	 *
	 * ⚠️ **DEPRECATED**: This method cannot provide true synchronous conversion due to underlying async dependencies (unified processor).
	 * Please use `convertAsync()` instead.
	 *
	 * @deprecated Use convertAsync() instead
	 * @param markdown - The Markdown content to convert
	 * @param options - Conversion options
	 * @returns The converted Typst string
	 * @throws Always throws an error to direct usage to convertAsync()
	 *
	 * @example
	 * ```typescript
	 * // ❌ Incorrect usage (deprecated)
	 * // const typst = window.bon.typst.convert("# Hello");
	 *
	 * // ✅ Correct usage (use async)
	 * const typst = await window.bon.typst.convertAsync("# Hello");
	 * console.log(typst); // "= Hello"
	 *
	 * // With options
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
	 * Asynchronously convert Markdown content or file (supports both file and string input)
	 *
	 * @param input - Markdown string or Obsidian TFile object
	 * @param options - Conversion options
	 * @returns Promise resolving to the converted Typst string
	 * @throws If conversion fails, file reading fails, or configuration is invalid
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
			// Handle string input
			if (typeof input === "string") {
				return await this.convertString(input, options);
			}

			// Handle TFile input
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
	 * Get a list of all available Typst conversion scripts
	 *
	 * @returns Promise resolving to an array of script names
	 *
	 * @example
	 * ```typescript
	 * const scripts = await window.bon.typst.listScripts();
	 * console.log(scripts); // ["default", "academic", "resume"]
	 *
	 * // Use the returned script name
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
	 * Convert a string (internal method)
	 */
	private async convertString(
		markdown: string,
		options?: ConvertOptions
	): Promise<string> {
		// Boundary check
		if (markdown.length === 0) {
			console.warn("[Typst API] Empty markdown string provided");
			return "";
		}

		// Validate configuration
		this.validateOptions(options);

		// Call the converter
		return await this.converter.convertMarkdown(markdown, {
			transformMode: options?.transformMode,
			scriptName: options?.scriptName,
			maxEmbedDepth: options?.maxEmbedDepth,
			currentFile: undefined, // There is no current file in string mode
		});
	}

	/**
	 * Convert a file (internal method)
	 *
	 * Behavior:
	 * - If autoCompile=true is specified, calls converter.convertFile() for full conversion + compilation (side effect: writes .typ and .pdf files)
	 * - Otherwise, only performs a pure conversion and returns the Typst string (no side effect)
	 */
	private async convertFile(
		file: TFile,
		options?: ConvertOptions
	): Promise<string> {
		// Boundary check
		if (file.extension.toLowerCase() !== "md") {
			throw new Error(
				`[Typst API] Invalid file type: "${file.extension}". Only Markdown (.md) files are supported.`
			);
		}

		// Validate configuration
		this.validateOptions(options);

		// Get metadata (for script selection and conversion)
		const metadata = this.app.metadataCache.getFileCache(file);

		// Case 1: Need auto-compile (side effect: write file and compile)
		if (options?.autoCompile) {
			const silent = options.silent ?? false;

			// Step 1: Call underlying convertFile(), write .typ file
			await this.converter.convertFile(file, metadata, { silent });

			// Step 2: Manually trigger compilation (since autoCompile is not in converter's settings)
			const typstPath = file.path.replace(/\.md$/, ".typ");
			try {
				await this.converter.compileTypstFile(typstPath, "pdf", silent);
			} catch (error) {
				const message =
					error instanceof Error ? error.message : String(error);
				console.error(
					`[Typst API] Compilation failed for "${typstPath}":`,
					message
				);
				// Do not throw on compile error, since conversion itself succeeded
				if (!silent) {
					// Notice has already been shown in compileTypstFile, just log here
				}
			}

			// Step 3: Read the generated .typ file content and return
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

		// Case 2: Pure conversion only, do not write file (no side effect)
		// Read file content
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

		// Call the converter
		return await this.converter.convertMarkdown(markdown, {
			transformMode: options?.transformMode,
			scriptName: options?.scriptName,
			maxEmbedDepth: options?.maxEmbedDepth,
			currentFile: file.path,
		});
	}

	/**
	 * Validate conversion options (internal method)
	 */
	private validateOptions(options?: ConvertOptions): void {
		if (!options) return;

		// Validate transformMode
		if (options.transformMode) {
			if (!["ast", "script"].includes(options.transformMode)) {
				throw new Error(
					`[Typst API] Invalid transformMode: "${options.transformMode}". Expected "ast" or "script".`
				);
			}
		}

		// Validate maxEmbedDepth
		if (
			options.maxEmbedDepth !== undefined &&
			(typeof options.maxEmbedDepth !== "number" ||
				options.maxEmbedDepth < 0)
		) {
			throw new Error(
				`[Typst API] Invalid maxEmbedDepth: must be a non-negative number.`
			);
		}

		// Validate scriptName (warn only, do not block)
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
	 * Check if an object is a TFile (internal method)
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

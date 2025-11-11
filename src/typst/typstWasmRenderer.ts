/**
 * Typst WASM Renderer
 * Uses typst.ts library to compile Typst code into SVG
 * Uses IndexedDB to cache WASM, avoiding large bundle size
 */

import { TypstCache } from "./typstCache";
import { TypstWasmStorage } from "./typstWasmStorage";

// Dynamic import for typst.ts
let typstModule: any = null;

export class TypstWasmRenderer {
	private cache: TypstCache;
	private storage: TypstWasmStorage;
	private initialized = false;
	private initPromise: Promise<void> | null = null;

	constructor(cacheSize: number = 100) {
		this.cache = new TypstCache(cacheSize);
		this.storage = new TypstWasmStorage();
	}

	/**
	 * Initialize the WASM renderer.
	 * Loads the typst.ts module.
	 */
	async initialize(): Promise<void> {
		// Prevent duplicate initialization
		if (this.initialized) {
			return;
		}

		if (this.initPromise) {
			return this.initPromise;
		}

		this.initPromise = this.doInitialize();
		return this.initPromise;
	}

	private async doInitialize(): Promise<void> {
		try {
			// Initialize IndexedDB
			await this.storage.initialize();

			// Check if WASM is cached
			const hasCompiler = await this.storage.hasWasm("compiler");
			const hasRenderer = await this.storage.hasWasm("renderer");

			if (!hasCompiler || !hasRenderer) {
				throw new Error(
					"WASM files not found in cache. Please download them from settings page first."
				);
			}

			// Load WASM from IndexedDB
			const compilerEntry = await this.storage.loadWasm("compiler");
			const rendererEntry = await this.storage.loadWasm("renderer");

			if (!compilerEntry || !rendererEntry) {
				throw new Error("Failed to load WASM from cache");
			}

			// Use all-in-one-lite version
			// Note: WASM version does not support external packages. Use CLI mode for external packages.
			const module = await import(
				"@myriaddreamin/typst.ts/dist/esm/contrib/all-in-one-lite.mjs"
			);
			typstModule = module;

			// Important: In Obsidian/Electron environment, configure WASM loading method
			// Use Blob URL to load WASM from IndexedDB cache

			if (typstModule.$typst) {
				// Configure compiler WASM
				typstModule.$typst.setCompilerInitOptions({
					getModule: () => {
						// Create Blob URL (from IndexedDB)
						// Explicitly convert to ArrayBuffer to avoid type errors
						// @ts-ignore SharedArrayBuffer is not supported in browsers
						const blob = new Blob([compilerEntry.data.buffer], {
							type: "application/wasm",
						});
						const url = URL.createObjectURL(blob);
						console.log(
							"Typst Compiler WASM loaded from IndexedDB:",
							url,
							`(v${compilerEntry.version}, ${(
								compilerEntry.size / 1024
							).toFixed(1)}KB)`
						);
						return url;
					},
				});

				// Configure renderer WASM
				typstModule.$typst.setRendererInitOptions({
					getModule: () => {
						// Create Blob URL
						// Explicitly convert to ArrayBuffer to avoid type errors
						// @ts-ignore SharedArrayBuffer is not supported in browsers
						const blob = new Blob([rendererEntry.data.buffer], {
							type: "application/wasm",
						});
						const url = URL.createObjectURL(blob);
						console.log(
							"Typst Renderer WASM loaded from IndexedDB:",
							url,
							`(v${rendererEntry.version}, ${(
								rendererEntry.size / 1024
							).toFixed(1)}KB)`
						);
						return url;
					},
				});
			}

			this.initialized = true;
			console.log("Typst WASM renderer initialized successfully");
		} catch (error) {
			console.error("Failed to initialize Typst WASM renderer:", error);
			throw new Error(
				`Typst renderer initialization failed: ${
					error instanceof Error ? error.message : String(error)
				}`
			);
		}
	}

	/**
	 * Render Typst code to SVG (with cache).
	 * @param code Typst source code
	 * @returns SVG string
	 */
	async renderToSVG(code: string): Promise<string> {
		if (!this.initialized) {
			await this.initialize();
		}

		// Check cache
		const codeHash = await this.hashCode(code);
		const cached = this.cache.get(codeHash);
		if (cached) {
			return cached;
		}

		// Compile
		const svg = await this.compile(code);

		// Cache result
		this.cache.set(codeHash, svg);

		return svg;
	}

	/**
	 * Compile Typst code to SVG (without cache).
	 * @param code Typst source code
	 * @returns SVG string
	 */
	private async compile(code: string): Promise<string> {
		try {
			// Use typst.ts $typst.svg API
			if (!typstModule || !typstModule.$typst) {
				throw new Error("Typst module not loaded");
			}

			// Add page settings before code for auto size and compact output
			// width: auto, height: auto for automatic sizing
			// margin: 0em to remove default margins and make output tighter
			const wrappedCode = `#set page(height: auto, margin: 2.07em)\n${code}`;

			const svg = await typstModule.$typst.svg({
				mainContent: wrappedCode,
			});

			if (typeof svg !== "string") {
				throw new Error("Invalid SVG output");
			}

			return svg;
		} catch (error) {
			console.error("Typst compilation error:", error);
			throw new Error(
				`Typst Compile Error: ${
					error instanceof Error ? error.message : String(error)
				}`
			);
		}
	}

	/**
	 * Calculate SHA-256 hash of code.
	 * @param code Source code
	 * @returns Hexadecimal hash string
	 */
	private async hashCode(code: string): Promise<string> {
		// Use browser native crypto API
		const encoder = new TextEncoder();
		const data = encoder.encode(code);
		const hashBuffer = await crypto.subtle.digest("SHA-256", data);
		const hashArray = Array.from(new Uint8Array(hashBuffer));
		const hashHex = hashArray
			.map((b) => b.toString(16).padStart(2, "0"))
			.join("");
		return hashHex;
	}

	/**
	 * Clear the cache.
	 */
	clearCache(): void {
		this.cache.clear();
	}

	/**
	 * Get cache statistics info.
	 */
	getCacheStats(): { size: number } {
		return {
			size: this.cache.size(),
		};
	}

	/**
	 * Get the WASM storage manager.
	 */
	getStorage(): TypstWasmStorage {
		return this.storage;
	}
}

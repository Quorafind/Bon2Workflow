/**
 * Typst WASM 渲染器
 * 使用 typst.ts 库将 Typst 代码编译为 SVG
 * 使用 IndexedDB 缓存 WASM，避免打包体积过大
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
	 * 初始化 WASM 渲染器
	 * 加载 typst.ts 模块
	 */
	async initialize(): Promise<void> {
		// 避免重复初始化
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
			// 初始化 IndexedDB
			await this.storage.initialize();

			// 检查是否已缓存 WASM
			const hasCompiler = await this.storage.hasWasm("compiler");
			const hasRenderer = await this.storage.hasWasm("renderer");

			if (!hasCompiler || !hasRenderer) {
				throw new Error(
					"WASM files not found in cache. Please download them from settings page first."
				);
			}

			// 从 IndexedDB 加载 WASM
			const compilerEntry = await this.storage.loadWasm("compiler");
			const rendererEntry = await this.storage.loadWasm("renderer");

			if (!compilerEntry || !rendererEntry) {
				throw new Error("Failed to load WASM from cache");
			}

			// 使用浏览器专用的 all-in-one-lite 版本，避免 Node.js fs 模块依赖
			const module = await import(
				"@myriaddreamin/typst.ts/dist/esm/contrib/all-in-one-lite.mjs"
			);
			typstModule = module;

			// 重要：在 Obsidian/Electron 环境中，必须配置 WASM 加载方式
			// 使用 Blob URL 加载 WASM（从 IndexedDB 缓存加载）

			if (typstModule.$typst) {
				// 配置编译器 WASM
				typstModule.$typst.setCompilerInitOptions({
					getModule: () => {
						// 创建 Blob URL（从 IndexedDB 加载）
						// 显式转换为 ArrayBuffer 以避免类型错误
						const blob = new Blob([compilerEntry.data.buffer], {
							type: "application/wasm",
						});
						const url = URL.createObjectURL(blob);
						console.log(
							"Typst Compiler WASM loaded from IndexedDB:",
							url,
							`(v${compilerEntry.version}, ${(compilerEntry.size / 1024).toFixed(1)}KB)`
						);
						return url;
					},
				});

				// 配置渲染器 WASM
				typstModule.$typst.setRendererInitOptions({
					getModule: () => {
						// 创建 Blob URL
						// 显式转换为 ArrayBuffer 以避免类型错误
						const blob = new Blob([rendererEntry.data.buffer], {
							type: "application/wasm",
						});
						const url = URL.createObjectURL(blob);
						console.log(
							"Typst Renderer WASM loaded from IndexedDB:",
							url,
							`(v${rendererEntry.version}, ${(rendererEntry.size / 1024).toFixed(1)}KB)`
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
				`Typst 渲染器初始化失败: ${
					error instanceof Error ? error.message : String(error)
				}`
			);
		}
	}

	/**
	 * 将 Typst 代码渲染为 SVG（带缓存）
	 * @param code Typst 源代码
	 * @returns SVG 字符串
	 */
	async renderToSVG(code: string): Promise<string> {
		if (!this.initialized) {
			await this.initialize();
		}

		// 检查缓存
		const codeHash = await this.hashCode(code);
		const cached = this.cache.get(codeHash);
		if (cached) {
			return cached;
		}

		// 编译
		const svg = await this.compile(code);

		// 缓存结果
		this.cache.set(codeHash, svg);

		return svg;
	}

	/**
	 * 编译 Typst 代码为 SVG（不使用缓存）
	 * @param code Typst 源代码
	 * @returns SVG 字符串
	 */
	private async compile(code: string): Promise<string> {
		try {
			// 使用 typst.ts 的 $typst.svg API
			if (!typstModule || !typstModule.$typst) {
				throw new Error("Typst module not loaded");
			}

			// 在代码前添加页面设置，让页面自动适应内容大小
			// width: auto, height: auto 让页面大小自动适应内容
			// margin: 0em 移除默认边距以获得更紧凑的输出
			const wrappedCode = `#set page(width: auto, height: auto, margin: 0em)\n${code}`;

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
				`Typst 编译失败: ${
					error instanceof Error ? error.message : String(error)
				}`
			);
		}
	}

	/**
	 * 计算代码的 SHA-256 哈希值
	 * @param code 源代码
	 * @returns 十六进制哈希字符串
	 */
	private async hashCode(code: string): Promise<string> {
		// 使用浏览器原生 crypto API
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
	 * 清空缓存
	 */
	clearCache(): void {
		this.cache.clear();
	}

	/**
	 * 获取缓存统计信息
	 */
	getCacheStats(): { size: number } {
		return {
			size: this.cache.size(),
		};
	}

	/**
	 * 获取 WASM 存储管理器
	 */
	getStorage(): TypstWasmStorage {
		return this.storage;
	}
}

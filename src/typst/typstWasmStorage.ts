/**
 * Typst WASM Storage Manager
 * 使用 IndexedDB 缓存 WASM 字节码，避免重复下载和打包体积过大
 */

const DB_NAME = "typst-wasm-cache";
const DB_VERSION = 1;
const STORE_NAME = "wasm-files";

export interface WasmStorageInfo {
	name: "compiler" | "renderer";
	version: string;
	size: number;
	timestamp: number;
}

export interface WasmEntry extends WasmStorageInfo {
	data: Uint8Array;
}

/**
 * IndexedDB 管理器，用于缓存 WASM 文件
 */
export class TypstWasmStorage {
	private db: IDBDatabase | null = null;

	/**
	 * 初始化数据库连接
	 */
	async initialize(): Promise<void> {
		return new Promise((resolve, reject) => {
			const request = indexedDB.open(DB_NAME, DB_VERSION);

			request.onerror = () => {
				reject(new Error("Failed to open IndexedDB"));
			};

			request.onsuccess = () => {
				this.db = request.result;
				resolve();
			};

			request.onupgradeneeded = (event) => {
				const db = (event.target as IDBOpenDBRequest).result;
				if (!db.objectStoreNames.contains(STORE_NAME)) {
					const store = db.createObjectStore(STORE_NAME, {
						keyPath: "name",
					});
					store.createIndex("timestamp", "timestamp", {
						unique: false,
					});
				}
			};
		});
	}

	/**
	 * 保存 WASM 文件到 IndexedDB
	 */
	async saveWasm(entry: WasmEntry): Promise<void> {
		if (!this.db) {
			await this.initialize();
		}

		return new Promise((resolve, reject) => {
			const transaction = this.db!.transaction([STORE_NAME], "readwrite");
			const store = transaction.objectStore(STORE_NAME);
			const request = store.put(entry);

			request.onsuccess = () => resolve();
			request.onerror = () =>
				reject(new Error("Failed to save WASM to IndexedDB"));
		});
	}

	/**
	 * 从 IndexedDB 加载 WASM 文件
	 */
	async loadWasm(
		name: "compiler" | "renderer"
	): Promise<WasmEntry | null> {
		if (!this.db) {
			await this.initialize();
		}

		return new Promise((resolve, reject) => {
			const transaction = this.db!.transaction([STORE_NAME], "readonly");
			const store = transaction.objectStore(STORE_NAME);
			const request = store.get(name);

			request.onsuccess = () => {
				const result = request.result as WasmEntry | undefined;
				resolve(result || null);
			};
			request.onerror = () =>
				reject(new Error("Failed to load WASM from IndexedDB"));
		});
	}

	/**
	 * 检查 WASM 是否已缓存
	 */
	async hasWasm(name: "compiler" | "renderer"): Promise<boolean> {
		const entry = await this.loadWasm(name);
		return entry !== null;
	}

	/**
	 * 获取缓存的 WASM 信息（不包含 data）
	 */
	async getWasmInfo(
		name: "compiler" | "renderer"
	): Promise<WasmStorageInfo | null> {
		const entry = await this.loadWasm(name);
		if (!entry) {
			return null;
		}

		return {
			name: entry.name,
			version: entry.version,
			size: entry.size,
			timestamp: entry.timestamp,
		};
	}

	/**
	 * 删除指定的 WASM 文件
	 */
	async deleteWasm(name: "compiler" | "renderer"): Promise<void> {
		if (!this.db) {
			await this.initialize();
		}

		return new Promise((resolve, reject) => {
			const transaction = this.db!.transaction([STORE_NAME], "readwrite");
			const store = transaction.objectStore(STORE_NAME);
			const request = store.delete(name);

			request.onsuccess = () => resolve();
			request.onerror = () =>
				reject(new Error("Failed to delete WASM from IndexedDB"));
		});
	}

	/**
	 * 清空所有缓存的 WASM 文件
	 */
	async clearAll(): Promise<void> {
		if (!this.db) {
			await this.initialize();
		}

		return new Promise((resolve, reject) => {
			const transaction = this.db!.transaction([STORE_NAME], "readwrite");
			const store = transaction.objectStore(STORE_NAME);
			const request = store.clear();

			request.onsuccess = () => resolve();
			request.onerror = () =>
				reject(new Error("Failed to clear WASM cache"));
		});
	}

	/**
	 * 获取所有缓存的 WASM 信息
	 */
	async listAll(): Promise<WasmStorageInfo[]> {
		if (!this.db) {
			await this.initialize();
		}

		return new Promise((resolve, reject) => {
			const transaction = this.db!.transaction([STORE_NAME], "readonly");
			const store = transaction.objectStore(STORE_NAME);
			const request = store.getAll();

			request.onsuccess = () => {
				const entries = request.result as WasmEntry[];
				const infos = entries.map((entry) => ({
					name: entry.name,
					version: entry.version,
					size: entry.size,
					timestamp: entry.timestamp,
				}));
				resolve(infos);
			};
			request.onerror = () =>
				reject(new Error("Failed to list WASM files"));
		});
	}

	/**
	 * 关闭数据库连接
	 */
	close(): void {
		if (this.db) {
			this.db.close();
			this.db = null;
		}
	}
}

/**
 * 从 URL 下载 WASM 文件并保存到 IndexedDB
 */
export async function downloadAndCacheWasm(
	url: string,
	name: "compiler" | "renderer",
	version: string,
	storage: TypstWasmStorage,
	onProgress?: (loaded: number, total: number) => void
): Promise<void> {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Failed to download WASM: ${response.statusText}`);
	}

	const reader = response.body?.getReader();
	if (!reader) {
		throw new Error("Failed to get response body reader");
	}

	const contentLength = parseInt(
		response.headers.get("content-length") || "0",
		10
	);
	let receivedLength = 0;
	const chunks: Uint8Array[] = [];

	while (true) {
		const { done, value } = await reader.read();
		if (done) {
			break;
		}

		chunks.push(value);
		receivedLength += value.length;

		if (onProgress && contentLength > 0) {
			onProgress(receivedLength, contentLength);
		}
	}

	// 合并所有 chunks
	const data = new Uint8Array(receivedLength);
	let position = 0;
	for (const chunk of chunks) {
		data.set(chunk, position);
		position += chunk.length;
	}

	// 保存到 IndexedDB
	await storage.saveWasm({
		name,
		version,
		size: data.length,
		timestamp: Date.now(),
		data,
	});
}

/**
 * 从本地文件加载 WASM 并保存到 IndexedDB
 */
export async function loadLocalWasmFile(
	file: File,
	name: "compiler" | "renderer",
	version: string,
	storage: TypstWasmStorage
): Promise<void> {
	const arrayBuffer = await file.arrayBuffer();
	const data = new Uint8Array(arrayBuffer);

	await storage.saveWasm({
		name,
		version,
		size: data.length,
		timestamp: Date.now(),
		data,
	});
}

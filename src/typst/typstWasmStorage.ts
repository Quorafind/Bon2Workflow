/**
 * Typst WASM Storage Manager
 * Use IndexedDB to cache WASM binaries to avoid repeated downloads and reduce bundle size.
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
 * IndexedDB manager for caching WASM files.
 */
export class TypstWasmStorage {
	private db: IDBDatabase | null = null;

	/**
	 * Initialize the database connection.
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
	 * Save a WASM file to IndexedDB.
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
	 * Load a WASM file from IndexedDB.
	 */
	async loadWasm(name: "compiler" | "renderer"): Promise<WasmEntry | null> {
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
	 * Check if the WASM file is cached.
	 */
	async hasWasm(name: "compiler" | "renderer"): Promise<boolean> {
		const entry = await this.loadWasm(name);
		return entry !== null;
	}

	/**
	 * Get cached WASM info (without data).
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
	 * Delete a specified WASM file.
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
	 * Clear all cached WASM files.
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
	 * Get information for all cached WASM files.
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
	 * Close the database connection.
	 */
	close(): void {
		if (this.db) {
			this.db.close();
			this.db = null;
		}
	}
}

/**
 * Download WASM file from URL and save to IndexedDB.
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

	// Merge all chunks
	const data = new Uint8Array(receivedLength);
	let position = 0;
	for (const chunk of chunks) {
		data.set(chunk, position);
		position += chunk.length;
	}

	// Save to IndexedDB
	await storage.saveWasm({
		name,
		version,
		size: data.length,
		timestamp: Date.now(),
		data,
	});
}

/**
 * Load WASM from a local file and save to IndexedDB.
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

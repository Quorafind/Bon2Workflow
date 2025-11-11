/**
 * LRU Cache Manager for caching Typst compilation results.
 * Uses the hash of the code content as the key.
 */

interface CacheEntry {
	svg: string;
	timestamp: number;
}

export class TypstCache {
	private cache = new Map<string, CacheEntry>();
	private accessOrder: string[] = [];

	constructor(private maxSize: number = 100) {
		if (maxSize <= 0) {
			throw new Error("Cache size must be greater than 0");
		}
	}

	/**
	 * Get cached SVG content by code hash.
	 * @param codeHash Hash of the code content
	 * @returns SVG string if exists, otherwise null
	 */
	get(codeHash: string): string | null {
		const entry = this.cache.get(codeHash);
		if (!entry) {
			return null;
		}

		// Update access order (LRU)
		this.updateAccessOrder(codeHash);
		return entry.svg;
	}

	/**
	 * Set a cache entry.
	 * @param codeHash Hash of the code content
	 * @param svg SVG content
	 */
	set(codeHash: string, svg: string): void {
		// If already exists, remove its old access record first
		if (this.cache.has(codeHash)) {
			this.removeFromAccessOrder(codeHash);
		}

		// If the cache is full, evict the least recently used item
		if (this.cache.size >= this.maxSize) {
			this.evictOldest();
		}

		// Add new entry
		this.cache.set(codeHash, {
			svg,
			timestamp: Date.now(),
		});
		this.accessOrder.push(codeHash);
	}

	/**
	 * Clear all cache entries.
	 */
	clear(): void {
		this.cache.clear();
		this.accessOrder = [];
	}

	/**
	 * Get current cache size.
	 */
	size(): number {
		return this.cache.size;
	}

	/**
	 * Update access order.
	 */
	private updateAccessOrder(codeHash: string): void {
		this.removeFromAccessOrder(codeHash);
		this.accessOrder.push(codeHash);
	}

	/**
	 * Remove an entry from the access order list.
	 */
	private removeFromAccessOrder(codeHash: string): void {
		const index = this.accessOrder.indexOf(codeHash);
		if (index !== -1) {
			this.accessOrder.splice(index, 1);
		}
	}

	/**
	 * Evict the least recently used entry.
	 */
	private evictOldest(): void {
		if (this.accessOrder.length === 0) {
			return;
		}

		const oldest = this.accessOrder.shift();
		if (oldest) {
			this.cache.delete(oldest);
		}
	}
}

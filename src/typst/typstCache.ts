/**
 * LRU 缓存管理器，用于缓存 Typst 编译结果
 * 使用代码内容的哈希值作为键
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
	 * 获取缓存的 SVG 内容
	 * @param codeHash 代码的哈希值
	 * @returns SVG 字符串，如果不存在则返回 null
	 */
	get(codeHash: string): string | null {
		const entry = this.cache.get(codeHash);
		if (!entry) {
			return null;
		}

		// 更新访问顺序（LRU）
		this.updateAccessOrder(codeHash);
		return entry.svg;
	}

	/**
	 * 设置缓存条目
	 * @param codeHash 代码的哈希值
	 * @param svg SVG 内容
	 */
	set(codeHash: string, svg: string): void {
		// 如果已存在，先删除旧的访问记录
		if (this.cache.has(codeHash)) {
			this.removeFromAccessOrder(codeHash);
		}

		// 如果缓存已满，删除最久未使用的条目
		if (this.cache.size >= this.maxSize) {
			this.evictOldest();
		}

		// 添加新条目
		this.cache.set(codeHash, {
			svg,
			timestamp: Date.now(),
		});
		this.accessOrder.push(codeHash);
	}

	/**
	 * 清空所有缓存
	 */
	clear(): void {
		this.cache.clear();
		this.accessOrder = [];
	}

	/**
	 * 获取当前缓存大小
	 */
	size(): number {
		return this.cache.size;
	}

	/**
	 * 更新访问顺序
	 */
	private updateAccessOrder(codeHash: string): void {
		this.removeFromAccessOrder(codeHash);
		this.accessOrder.push(codeHash);
	}

	/**
	 * 从访问顺序列表中移除
	 */
	private removeFromAccessOrder(codeHash: string): void {
		const index = this.accessOrder.indexOf(codeHash);
		if (index !== -1) {
			this.accessOrder.splice(index, 1);
		}
	}

	/**
	 * 删除最久未使用的条目
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

/**
 * Abstract base class for managing content files (scripts, templates, etc.)
 *
 * This base class implements the common CRUD operations and caching mechanism
 * for file-based content management. Subclasses only need to specify:
 * - File extension
 * - Default content
 * - Default content name
 *
 * @example
 * ```ts
 * class MyContentManager extends BaseContentManager<string> {
 *   protected readonly fileExtension = ".txt";
 *   protected readonly defaultContentName = "default";
 *
 *   protected getDefaultContent(): string {
 *     return "Default content";
 *   }
 * }
 * ```
 */

import { normalizePath, Vault } from "obsidian";

export abstract class BaseContentManager<T = string> {
	/**
	 * File extension for this content type (e.g., ".js", ".typ")
	 * Must be implemented by subclasses
	 */
	protected abstract readonly fileExtension: string;

	/**
	 * Default content name (e.g., "default")
	 * Must be implemented by subclasses
	 */
	protected abstract readonly defaultContentName: string;

	/**
	 * Get the default content for this content type
	 * Must be implemented by subclasses
	 */
	protected abstract getDefaultContent(): T;

	/**
	 * Cache for loaded content (name -> content)
	 */
	private contentCache = new Map<string, T>();

	/**
	 * Directory path for storing content files
	 */
	protected readonly contentDirectory: string;

	constructor(protected vault: Vault, contentDir: string) {
		this.contentDirectory = normalizePath(contentDir);
	}

	/**
	 * Ensure the content directory exists in the vault
	 */
	async ensureDirectory(): Promise<void> {
		const adapter = this.vault.adapter;
		const exists = await adapter.exists(this.contentDirectory);
		if (!exists) {
			await adapter.mkdir(this.contentDirectory);
		}
	}

	/**
	 * Initialize the default content (always overwrite with latest template)
	 * The default content is a read-only template and should not be edited by users
	 */
	async initializeDefaultContent(): Promise<void> {
		await this.ensureDirectory();
		const defaultPath = this.getContentPath(this.defaultContentName);
		const adapter = this.vault.adapter;

		// Always overwrite default content with the latest template
		const defaultContent = this.getDefaultContent();
		await adapter.write(defaultPath, String(defaultContent));
		this.contentCache.set(this.defaultContentName, defaultContent);
	}

	/**
	 * Get the default content
	 */
	async getDefault(): Promise<T> {
		await this.initializeDefaultContent();
		return this.getDefaultContent();
	}

	/**
	 * List available content names (without file extension)
	 */
	async listContents(): Promise<string[]> {
		await this.ensureDirectory();
		const listing = await this.vault.adapter.list(this.contentDirectory);
		return listing.files
			.filter((file) => file.endsWith(this.fileExtension))
			.map((file) => file.split(/[/\\]/).pop() ?? file)
			.map((file) => file.replace(new RegExp(`\\${this.fileExtension}$`), ""));
	}

	/**
	 * Load content by name. Returns default content if not found.
	 * @param contentName Content name (without extension)
	 */
	async loadContent(contentName: string): Promise<T> {
		const normalized =
			this.normalizeContentName(contentName) || this.defaultContentName;
		if (this.contentCache.has(normalized)) {
			return this.contentCache.get(normalized) as T;
		}

		const path = this.getContentPath(normalized);
		const adapter = this.vault.adapter;

		if (!(await adapter.exists(path))) {
			if (normalized === this.defaultContentName) {
				await this.initializeDefaultContent();
				return this.getDefaultContent();
			}
			return this.loadContent(this.defaultContentName);
		}

		const content = await adapter.read(path);
		const typedContent = content as unknown as T;
		this.contentCache.set(normalized, typedContent);
		return typedContent;
	}

	/**
	 * Save or update content with provided data
	 * @param contentName Content name (without extension)
	 * @param content Content data
	 */
	async saveContent(contentName: string, content: T): Promise<void> {
		const normalized = this.normalizeContentName(contentName);
		this.validateContentName(normalized);

		await this.ensureDirectory();

		const path = this.getContentPath(normalized);
		await this.vault.adapter.write(path, String(content));
		this.contentCache.set(normalized, content);
	}

	/**
	 * Delete content by name
	 * @param contentName Content name to delete
	 * @param protectedContentName Optional protected content name (cannot be deleted)
	 */
	async deleteContent(contentName: string, protectedContentName?: string): Promise<void> {
		const normalized = this.normalizeContentName(contentName);
		this.validateContentName(normalized);

		// Cannot delete the default template
		if (normalized === this.defaultContentName) {
			throw new Error(`The "${this.defaultContentName}" template cannot be deleted`);
		}

		// Cannot delete the user's protected content
		if (protectedContentName && normalized === this.normalizeContentName(protectedContentName)) {
			throw new Error(`Cannot delete "${normalized}" as it is protected`);
		}

		const path = this.getContentPath(normalized);
		const adapter = this.vault.adapter;
		if (await adapter.exists(path)) {
			await adapter.remove(path);
		}
		this.contentCache.delete(normalized);
	}

	/**
	 * Copy content to a new name
	 * @param sourceContentName Source content name
	 * @param targetContentName Target content name
	 */
	async copyContent(sourceContentName: string, targetContentName: string): Promise<void> {
		const normalizedSource = this.normalizeContentName(sourceContentName);
		const normalizedTarget = this.normalizeContentName(targetContentName);

		this.validateContentName(normalizedTarget);

		if (normalizedTarget === this.defaultContentName) {
			throw new Error(`Cannot overwrite the "${this.defaultContentName}" template`);
		}

		// Check if target already exists
		const targetPath = this.getContentPath(normalizedTarget);
		if (await this.vault.adapter.exists(targetPath)) {
			throw new Error(`Content "${normalizedTarget}" already exists`);
		}

		// Load source content
		const sourceContent = await this.loadContent(normalizedSource);

		// Save to target
		await this.saveContent(normalizedTarget, sourceContent);
	}

	/**
	 * Get full content file path in the vault
	 * @param contentName Content name (without extension)
	 */
	protected getContentPath(contentName: string): string {
		return normalizePath(`${this.contentDirectory}/${contentName}${this.fileExtension}`);
	}

	/**
	 * Normalize content name (remove extension, trim whitespace)
	 * @param contentName Raw content name
	 */
	protected normalizeContentName(contentName: string): string {
		return contentName.trim().replace(new RegExp(`\\${this.fileExtension}$`), "");
	}

	/**
	 * Validate content name (required, no path separator)
	 * @param contentName Normalized content name
	 * @throws Error if validation fails
	 */
	protected validateContentName(contentName: string): void {
		if (!contentName) {
			throw new Error("Content name cannot be empty");
		}

		if (/[\/\\]/.test(contentName)) {
			throw new Error("Content name cannot contain path separators");
		}
	}

	/**
	 * Clear the content cache
	 */
	clearCache(): void {
		this.contentCache.clear();
	}
}

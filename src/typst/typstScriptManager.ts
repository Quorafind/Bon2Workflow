import { normalizePath, Vault } from "obsidian";

const DEFAULT_SCRIPT_NAME = "default";
const DEFAULT_SCRIPT_FILENAME = `${DEFAULT_SCRIPT_NAME}.js`;
const DEFAULT_SCRIPT_CONTENT = `/**
 * Default Script Example: Set Typst Document Template
 *
 * For complex transformation logic, use API calls outside the sandbox.
 * This script demonstrates how to set a basic Typst document template only.
 *
 * @param {string} content - Document content
 * @returns {string} - Typst code with template settings applied
 */
function transform(content) {
	// Basic template settings example
	const template = \`#set page(
  paper: "a4",
  margin: (x: 1.8cm, y: 1.5cm),
)

#set text(
  font: "Noto Serif CJK SC",
  size: 10.5pt,
  lang: "zh",
)

#set par(
  justify: true,
  leading: 0.65em,
)

\`;

	// Return template + content
	return template + content;
}
`;

export class TypstScriptManager {
	private scriptCache = new Map<string, string>();
	private readonly scriptDirectory: string;

	constructor(private vault: Vault, scriptDir: string) {
		this.scriptDirectory = normalizePath(scriptDir || "typst-scripts");
	}

	/**
	 * Ensure the script directory exists in the vault.
	 */
	async ensureScriptDirectory(): Promise<void> {
		const adapter = this.vault.adapter;
		const exists = await adapter.exists(this.scriptDirectory);
		if (!exists) {
			await adapter.mkdir(this.scriptDirectory);
		}
	}

	/**
	 * Initialize the default script if it does not exist.
	 */
	async initializeDefaultScript(): Promise<void> {
		await this.ensureScriptDirectory();
		const defaultPath = this.getScriptPath(DEFAULT_SCRIPT_NAME);
		const adapter = this.vault.adapter;

		if (!(await adapter.exists(defaultPath))) {
			await adapter.write(defaultPath, DEFAULT_SCRIPT_CONTENT);
			this.scriptCache.set(DEFAULT_SCRIPT_NAME, DEFAULT_SCRIPT_CONTENT);
		}
	}

	/**
	 * Get the content of the default script.
	 */
	async getDefaultScript(): Promise<string> {
		await this.initializeDefaultScript();
		return DEFAULT_SCRIPT_CONTENT;
	}

	/**
	 * List available script names (without file extension).
	 */
	async listScripts(): Promise<string[]> {
		await this.ensureScriptDirectory();
		const listing = await this.vault.adapter.list(this.scriptDirectory);
		return listing.files
			.filter((file) => file.endsWith(".js"))
			.map((file) => file.split(/[/\\]/).pop() ?? file)
			.map((file) => file.replace(/\.js$/, ""));
	}

	/**
	 * Load script content by script name. Returns default script if not found.
	 */
	async loadScript(scriptName: string): Promise<string> {
		const normalized =
			this.normalizeScriptName(scriptName) || DEFAULT_SCRIPT_NAME;
		if (this.scriptCache.has(normalized)) {
			return this.scriptCache.get(normalized) as string;
		}

		const path = this.getScriptPath(normalized);
		const adapter = this.vault.adapter;

		if (!(await adapter.exists(path))) {
			if (normalized === DEFAULT_SCRIPT_NAME) {
				await this.initializeDefaultScript();
				return DEFAULT_SCRIPT_CONTENT;
			}
			return this.loadScript(DEFAULT_SCRIPT_NAME);
		}

		const content = await adapter.read(path);
		this.scriptCache.set(normalized, content);
		return content;
	}

	/**
	 * Save or update the script with provided content.
	 */
	async saveScript(scriptName: string, content: string): Promise<void> {
		const normalized = this.normalizeScriptName(scriptName);
		this.validateScriptName(normalized);

		await this.ensureScriptDirectory();

		const path = this.getScriptPath(normalized);
		await this.vault.adapter.write(path, content);
		this.scriptCache.set(normalized, content);
	}

	/**
	 * Delete a script by name. The default script cannot be deleted.
	 */
	async deleteScript(scriptName: string): Promise<void> {
		const normalized = this.normalizeScriptName(scriptName);
		this.validateScriptName(normalized);
		if (normalized === DEFAULT_SCRIPT_NAME) {
			throw new Error("The default script cannot be deleted");
		}

		const path = this.getScriptPath(normalized);
		const adapter = this.vault.adapter;
		if (await adapter.exists(path)) {
			await adapter.remove(path);
		}
		this.scriptCache.delete(normalized);
	}

	/**
	 * Get full script file path in the vault.
	 */
	private getScriptPath(scriptName: string): string {
		return normalizePath(`${this.scriptDirectory}/${scriptName}.js`);
	}

	/**
	 * Normalize script name (no extension, trimmed).
	 */
	private normalizeScriptName(scriptName: string): string {
		return scriptName.trim().replace(/\.js$/, "");
	}

	/**
	 * Validate script name (required, no path separator).
	 */
	private validateScriptName(scriptName: string): void {
		if (!scriptName) {
			throw new Error("Script name cannot be empty");
		}

		if (/[\/\\]/.test(scriptName)) {
			throw new Error("Script name cannot contain path separators");
		}
	}
}

export { DEFAULT_SCRIPT_CONTENT, DEFAULT_SCRIPT_NAME, DEFAULT_SCRIPT_FILENAME };

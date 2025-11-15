import { Vault } from "obsidian";
import { BaseContentManager } from "./typstBaseContentManager";

const DEFAULT_SCRIPT_NAME = "default";
const DEFAULT_SCRIPT_FILENAME = `${DEFAULT_SCRIPT_NAME}.js`;
const DEFAULT_SCRIPT_CONTENT = `/**
 * Default Script Example: Set Typst Document Template
 *
 * This script uses the built-in AST converter (convertToTypst) to transform
 * Markdown to Typst, then prepends document template settings.
 *
 * @param {string} content - Markdown content
 * @returns {string} - Typst code with template settings applied
 */
async function transform(content) {
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

	// Convert Markdown to Typst using the built-in AST converter
	const typstContent = await convertToTypst(content);

	// Return template + converted content
	return template + typstContent;
}
`;

/**
 * Manages Typst transformation scripts (.js files)
 * Extends BaseContentManager to inherit common file management operations
 */
export class TypstScriptManager extends BaseContentManager<string> {
	protected readonly fileExtension = ".js";
	protected readonly defaultContentName = DEFAULT_SCRIPT_NAME;

	constructor(vault: Vault, scriptDir: string) {
		super(vault, scriptDir || "typst-scripts");
	}

	protected getDefaultContent(): string {
		return DEFAULT_SCRIPT_CONTENT;
	}

	// ===== Backward Compatibility Aliases =====
	// These methods provide backward compatibility with existing code

	/**
	 * Ensure the script directory exists in the vault.
	 * @deprecated Use ensureDirectory() from base class
	 */
	async ensureScriptDirectory(): Promise<void> {
		return this.ensureDirectory();
	}

	/**
	 * Initialize the default script (always overwrite with latest template).
	 * The "default" script is a read-only template and should not be edited by users.
	 */
	async initializeDefaultScript(): Promise<void> {
		return this.initializeDefaultContent();
	}

	/**
	 * Get the content of the default script.
	 */
	async getDefaultScript(): Promise<string> {
		return this.getDefault();
	}

	/**
	 * List available script names (without file extension).
	 */
	async listScripts(): Promise<string[]> {
		return this.listContents();
	}

	/**
	 * Load script content by script name. Returns default script if not found.
	 */
	async loadScript(scriptName: string): Promise<string> {
		return this.loadContent(scriptName);
	}

	/**
	 * Save or update the script with provided content.
	 */
	async saveScript(scriptName: string, content: string): Promise<void> {
		return this.saveContent(scriptName, content);
	}

	/**
	 * Delete a script by name.
	 * @param scriptName Script name to delete
	 * @param protectedScriptName Optional protected script name (cannot be deleted)
	 */
	async deleteScript(scriptName: string, protectedScriptName?: string): Promise<void> {
		return this.deleteContent(scriptName, protectedScriptName);
	}

	/**
	 * Copy a script to a new name.
	 * @param sourceScriptName Source script name
	 * @param targetScriptName Target script name
	 */
	async copyScript(sourceScriptName: string, targetScriptName: string): Promise<void> {
		return this.copyContent(sourceScriptName, targetScriptName);
	}
}

export { DEFAULT_SCRIPT_CONTENT, DEFAULT_SCRIPT_NAME, DEFAULT_SCRIPT_FILENAME };


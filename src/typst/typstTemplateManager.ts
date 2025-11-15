import { Vault } from "obsidian";
import { BaseContentManager } from "./typstBaseContentManager";

const DEFAULT_TEMPLATE_NAME = "default";
const DEFAULT_TEMPLATE_FILENAME = `${DEFAULT_TEMPLATE_NAME}.typ`;
const DEFAULT_TEMPLATE_CONTENT = `// Default Typst Template
// Based on Typst tutorial - academic paper template
// This template is read-only and will be regenerated on plugin load

#set page(
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

#set heading(numbering: "1.1")

// Your document content will be appended below this template
`;

/**
 * Manages Typst templates (.typ files)
 * Extends BaseContentManager to inherit common file management operations
 *
 * Templates are pure Typst code files that define document styling and layout.
 * They are prepended to the converted Markdown content before compilation.
 */
export class TypstTemplateManager extends BaseContentManager<string> {
	protected readonly fileExtension = ".typ";
	protected readonly defaultContentName = DEFAULT_TEMPLATE_NAME;

	constructor(vault: Vault, templateDir: string) {
		super(vault, templateDir || "typst-templates");
	}

	protected getDefaultContent(): string {
		return DEFAULT_TEMPLATE_CONTENT;
	}

	// ===== Convenience Aliases =====
	// Provide template-specific method names for consistency

	/**
	 * Ensure the template directory exists in the vault.
	 */
	async ensureTemplateDirectory(): Promise<void> {
		return this.ensureDirectory();
	}

	/**
	 * Initialize the default template (always overwrite with latest).
	 * The "default" template is a read-only template and should not be edited by users.
	 */
	async initializeDefaultTemplate(): Promise<void> {
		return this.initializeDefaultContent();
	}

	/**
	 * Get the content of the default template.
	 */
	async getDefaultTemplate(): Promise<string> {
		return this.getDefault();
	}

	/**
	 * List available template names (without file extension).
	 */
	async listTemplates(): Promise<string[]> {
		return this.listContents();
	}

	/**
	 * Load template content by template name. Returns default template if not found.
	 */
	async loadTemplate(templateName: string): Promise<string> {
		return this.loadContent(templateName);
	}

	/**
	 * Save or update the template with provided content.
	 */
	async saveTemplate(templateName: string, content: string): Promise<void> {
		return this.saveContent(templateName, content);
	}

	/**
	 * Delete a template by name.
	 * @param templateName Template name to delete
	 * @param protectedTemplateName Optional protected template name (cannot be deleted)
	 */
	async deleteTemplate(templateName: string, protectedTemplateName?: string): Promise<void> {
		return this.deleteContent(templateName, protectedTemplateName);
	}

	/**
	 * Copy a template to a new name.
	 * @param sourceTemplateName Source template name
	 * @param targetTemplateName Target template name
	 */
	async copyTemplate(sourceTemplateName: string, targetTemplateName: string): Promise<void> {
		return this.copyContent(sourceTemplateName, targetTemplateName);
	}
}

export { DEFAULT_TEMPLATE_CONTENT, DEFAULT_TEMPLATE_NAME, DEFAULT_TEMPLATE_FILENAME };

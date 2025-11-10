import { normalizePath, Vault } from "obsidian";

const DEFAULT_SCRIPT_NAME = "default";
const DEFAULT_SCRIPT_FILENAME = `${DEFAULT_SCRIPT_NAME}.js`;
const DEFAULT_SCRIPT_CONTENT = `/**
 * 默认 Markdown -> Typst 转换脚本
 * 支持 Obsidian 特殊语法
 * @param {string} content - Markdown 文件内容
 * @returns {string} - Typst 格式内容
 */
function transform(content) {
	let result = content;

	// ========== 阶段 1: 移除 frontmatter ==========
	result = result.replace(/^---[\\s\\S]*?---\\n?/, "");

	// ========== 阶段 2: 处理 Obsidian 特殊语法 ==========

	// 2.1 移除 Obsidian 注释 (%%注释%%)
	result = result.replace(/%%[\\s\\S]*?%%/g, "");

	// 2.2 处理嵌入内容 ![[文件]] -> [嵌入: 文件]
	result = result.replace(/!\\[\\[([^\\]]+)\\]\\]/g, "[嵌入: $1]");

	// 2.3 处理 Wiki 链接 [[链接|显示文本]] 或 [[链接]]
	result = result.replace(/\\[\\[([^\\]|]+)\\|([^\\]]+)\\]\\]/g, "$2");  // [[link|text]] -> text
	result = result.replace(/\\[\\[([^\\]]+)\\]\\]/g, "$1");  // [[link]] -> link

	// 2.4 处理高亮 ==文本== -> #highlight[文本]
	result = result.replace(/==([^=]+)==/g, "#highlight[$1]");

	// 2.5 处理任务列表
	result = result.replace(/^(\\s*)-\\s+\\[x\\]\\s+/gm, "$1☑ ");  // 已完成
	result = result.replace(/^(\\s*)-\\s+\\[ \\]\\s+/gm, "$1☐ ");  // 未完成

	// 2.6 处理 Callouts (简化处理: > [!type] -> 【type】)
	result = result.replace(/^>\\s*\\[!([^\\]]+)\\]/gm, "*【$1】*");

	// 2.7 转义 Obsidian 标签 (关键: 必须在标题转换之前!)
	// 匹配行内标签: #标签 但不是标题开头
	// 标题模式: ^#{1,6}\\s+  (行首 + 1-6个# + 空格)
	// 标签模式: #\\S+  (# + 非空白字符, 但不在行首或前面有空格)

	// 先用占位符保护标题
	const headingPlaceholders = [];
	result = result.replace(/^(#{1,6}\\s+.+)$/gm, (match) => {
		const index = headingPlaceholders.length;
		headingPlaceholders.push(match);
		return \`__HEADING_PLACEHOLDER_\${index}__\`;
	});

	// 现在可以安全地转义所有 # 标签
	result = result.replace(/#([^\\s#][^\\s]*)/g, "\\\\#$1");

	// 恢复标题
	headingPlaceholders.forEach((heading, index) => {
		result = result.replace(\`__HEADING_PLACEHOLDER_\${index}__\`, heading);
	});

	// ========== 阶段 3: 标准 Markdown -> Typst 转换 ==========

	// 3.1 标题转换 (# -> #heading[])
	result = result.replace(/^######\\s+(.+)$/gm, '#heading(level: 6)[$1]');
	result = result.replace(/^#####\\s+(.+)$/gm, '#heading(level: 5)[$1]');
	result = result.replace(/^####\\s+(.+)$/gm, '#heading(level: 4)[$1]');
	result = result.replace(/^###\\s+(.+)$/gm, '#heading(level: 3)[$1]');
	result = result.replace(/^##\\s+(.+)$/gm, '#heading(level: 2)[$1]');
	result = result.replace(/^#\\s+(.+)$/gm, '#heading(level: 1)[$1]');

	// 3.2 粗体 (**text** -> *text*)
	result = result.replace(/\\*\\*(.+?)\\*\\*/g, "*$1*");

	// 3.3 斜体 (*text* -> _text_)
	result = result.replace(/(?<!\\*)\\*(?!\\*)(.+?)\\*(?!\\*)/g, "_$1_");

	// 3.4 行内代码保持不变 (\`code\`)
	// Typst 也使用反引号,保持不变

	// 3.5 链接 ([text](url) -> #link("url")[text])
	result = result.replace(/\\[(.+?)\\]\\((.+?)\\)/g, '#link("$2")[$1]');

	// 3.6 图片 (![alt](url) -> #image("url"))
	result = result.replace(/!\\[(.+?)\\]\\((.+?)\\)/g, '#image("$2")');

	// 3.7 代码块保持不变
	// Markdown 和 Typst 都使用 \`\`\`

	// ========== 阶段 4: 清理和最终处理 ==========

	// 4.1 清理多余的空行 (超过2个连续空行 -> 2个空行)
	result = result.replace(/\\n{3,}/g, "\\n\\n");

	return result;
}
`;

export class TypstScriptManager {
	private scriptCache = new Map<string, string>();
	private readonly scriptDirectory: string;

	constructor(private vault: Vault, scriptDir: string) {
		this.scriptDirectory = normalizePath(scriptDir || "typst-scripts");
	}

	async ensureScriptDirectory(): Promise<void> {
		const adapter = this.vault.adapter;
		const exists = await adapter.exists(this.scriptDirectory);
		if (!exists) {
			await adapter.mkdir(this.scriptDirectory);
		}
	}

	async initializeDefaultScript(): Promise<void> {
		await this.ensureScriptDirectory();
		const defaultPath = this.getScriptPath(DEFAULT_SCRIPT_NAME);
		const adapter = this.vault.adapter;

		if (!(await adapter.exists(defaultPath))) {
			await adapter.write(defaultPath, DEFAULT_SCRIPT_CONTENT);
			this.scriptCache.set(DEFAULT_SCRIPT_NAME, DEFAULT_SCRIPT_CONTENT);
		}
	}

	async getDefaultScript(): Promise<string> {
		await this.initializeDefaultScript();
		return DEFAULT_SCRIPT_CONTENT;
	}

	async listScripts(): Promise<string[]> {
		await this.ensureScriptDirectory();
		const listing = await this.vault.adapter.list(this.scriptDirectory);
		return listing.files
			.filter((file) => file.endsWith(".js"))
			.map((file) => file.split(/[/\\]/).pop() ?? file)
			.map((file) => file.replace(/\.js$/, ""));
	}

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

	async saveScript(scriptName: string, content: string): Promise<void> {
		const normalized = this.normalizeScriptName(scriptName);
		this.validateScriptName(normalized);

		await this.ensureScriptDirectory();

		const path = this.getScriptPath(normalized);
		await this.vault.adapter.write(path, content);
		this.scriptCache.set(normalized, content);
	}

	async deleteScript(scriptName: string): Promise<void> {
		const normalized = this.normalizeScriptName(scriptName);
		this.validateScriptName(normalized);
		if (normalized === DEFAULT_SCRIPT_NAME) {
			throw new Error("默认脚本不可删除");
		}

		const path = this.getScriptPath(normalized);
		const adapter = this.vault.adapter;
		if (await adapter.exists(path)) {
			await adapter.remove(path);
		}
		this.scriptCache.delete(normalized);
	}

	private getScriptPath(scriptName: string): string {
		return normalizePath(`${this.scriptDirectory}/${scriptName}.js`);
	}

	private normalizeScriptName(scriptName: string): string {
		return scriptName.trim().replace(/\.js$/, "");
	}

	private validateScriptName(scriptName: string): void {
		if (!scriptName) {
			throw new Error("脚本名称不能为空");
		}

		if (/[\\/]/.test(scriptName)) {
			throw new Error("脚本名称不可包含路径分隔符");
		}
	}
}

export { DEFAULT_SCRIPT_CONTENT, DEFAULT_SCRIPT_NAME, DEFAULT_SCRIPT_FILENAME };


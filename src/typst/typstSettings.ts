export type TypstTransformMode = "ast" | "script";
export type TypstPreviewMode = "compile" | "wasm" | "none";
export type TypstCompileFormat = "pdf" | "png" | "svg";

export interface TypstSettings {
	enabled: boolean;
	triggerTags: string[];
	autoCompile: boolean;
	scriptDirectory: string;
	templateMapping: Record<string, string>;
	transformMode: TypstTransformMode;
	maxEmbedDepth: number;
	// Code block rendering settings
	enableCodeBlock: boolean;
	codeBlockCacheSize: number;
	// Preview mode settings (per file)
	previewMode: TypstPreviewMode;
	// CLI compilation output format
	compileFormat: TypstCompileFormat;
	/**
	 * Custom Typst CLI executable path (optional)
	 * If not set, will auto-detect typst in system PATH or common installation paths
	 */
	typstCliPath?: string;
	/**
	 * Enable enhanced checkbox support with cheq package
	 * When enabled: Imports @preview/cheq package for 24+ checkbox styles (requires CLI compilation)
	 * When disabled: Uses basic GFM checkboxes only (WASM compatible, faster rendering)
	 * @default true
	 */
	enableCheckboxEnhancement: boolean;
	/**
	 * User's default script name (used when no folder mapping or frontmatter script specified)
	 * Note: "default" is a special read-only template script
	 * @default "default"
	 */
	defaultScriptName: string;

	// === 模板系统配置 ===
	/**
	 * Enable Typst template system
	 * When enabled, templates (.typ files) will be prepended to converted content
	 * @default true
	 */
	enableTemplateSystem: boolean;

	/**
	 * Template files storage directory
	 * @default "typst-templates"
	 */
	templateDirectory: string;

	/**
	 * User's default template name (used when no folder mapping or frontmatter specified)
	 * Note: "default" is a special read-only template
	 * @default "default"
	 */
	defaultTemplateName: string;

	/**
	 * Folder path to template name mapping
	 * Example: { "projects/reports": "academic-paper", "notes/blog": "blog-post" }
	 */
	templateFolderMapping: Record<string, string>;

	// === 中间文件配置 ===
	/**
	 * .typ 文件存储模式
	 * - "same-dir": 与源 .md 文件同目录（默认，向后兼容）
	 * - "unified": 统一存储到指定目录
	 * - "custom": 自定义目录（相对于vault根目录或绝对路径）
	 */
	typFileStorageMode: "same-dir" | "unified" | "custom";

	/**
	 * .typ 文件存储目录（unified/custom模式下使用）
	 * - unified模式：默认为 ".typst-temp"
	 * - custom模式：用户自定义路径
	 */
	typFileDirectory?: string;

	// === 输出文件配置 ===
	/**
	 * 输出文件（pdf/png/svg）存储目录
	 * - 未设置：与源文件同目录（默认）
	 * - 设置后：统一输出到指定目录
	 */
	outputDirectory?: string;

	/**
	 * 输出文件命名来源优先级
	 * - "frontmatter": 从 frontmatter.typst-output-name 读取
	 * - "folder": 使用父文件夹名
	 * - "filename": 使用文件名（默认）
	 */
	outputNamingPriority: ("frontmatter" | "folder" | "filename")[];

	/**
	 * 输出文件名是否附加时间戳
	 * - false: 不附加（默认）
	 * - true: 附加格式 YYYYMMDD-HHmmss
	 */
	outputAppendTimestamp: boolean;

	/**
	 * 自动编译时是否显示 Notice 通知
	 * - false: 静默编译（默认，避免频繁打扰）
	 * - true: 显示编译成功通知（包含交互按钮）
	 */
	showNoticeOnAutoCompile: boolean;
}

export const DEFAULT_TYPST_SETTINGS: TypstSettings = {
	enabled: false,
	triggerTags: ["bon-typst"],
	autoCompile: false,
	scriptDirectory: "typst-scripts",
	templateMapping: {},
	transformMode: "ast",
	maxEmbedDepth: 5,
	enableCodeBlock: true,
	codeBlockCacheSize: 100,
	previewMode: "compile", // Default to CLI per file
	compileFormat: "pdf", // Default output is PDF (can be displayed in preview view)
	typstCliPath: undefined, // Auto-detect by default
	enableCheckboxEnhancement: true, // Enable by default for full feature support
	defaultScriptName: "default", // Use default template script by default

	// 模板系统默认值
	enableTemplateSystem: true,
	templateDirectory: "typst-templates",
	defaultTemplateName: "default",
	templateFolderMapping: {},

	// 新增默认值（向后兼容）
	typFileStorageMode: "same-dir",
	typFileDirectory: ".typst-temp",
	outputDirectory: undefined,
	outputNamingPriority: ["frontmatter", "folder", "filename"],
	outputAppendTimestamp: false,
	showNoticeOnAutoCompile: false, // 默认静默，避免频繁打扰
};

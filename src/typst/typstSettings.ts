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
	compileFormat: "svg", // Default output is SVG (can be displayed in preview view)
	typstCliPath: undefined, // Auto-detect by default
};

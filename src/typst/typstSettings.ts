export type TypstTransformMode = "ast" | "script";

export interface TypstSettings {
	enabled: boolean;
	triggerTags: string[];
	autoCompile: boolean;
	scriptDirectory: string;
	templateMapping: Record<string, string>;
	transformMode: TypstTransformMode;
	maxEmbedDepth: number;
	// 代码块渲染设置
	enableCodeBlock: boolean;
	codeBlockCacheSize: number;
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
};

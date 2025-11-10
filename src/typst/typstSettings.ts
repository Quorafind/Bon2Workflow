export interface TypstSettings {
	triggerTags: string[];
	autoCompile: boolean;
	scriptDirectory: string;
	templateMapping: Record<string, string>;
}

export const DEFAULT_TYPST_SETTINGS: TypstSettings = {
	triggerTags: ["bon-typst"],
	autoCompile: false,
	scriptDirectory: "typst-scripts",
	templateMapping: {},
};


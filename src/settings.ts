import type { TypstSettings } from "./typst/typstSettings";
import { DEFAULT_TYPST_SETTINGS } from "./typst/typstSettings";

export interface bon2workflowSettings {
	historyChars: {
		[key: string]: number;
	};
	enableCount: boolean;
	typst: TypstSettings;
	folderCheck: foderCheckSettings;
}

export interface foderCheckSettings {
	enabled: boolean;
	targetPath: string;
}

export const bon2workflow_SETTINGS: bon2workflowSettings = {
	historyChars: {},
	enableCount: true,
	typst: DEFAULT_TYPST_SETTINGS,
	folderCheck: {
		enabled: false,
		targetPath: "TODO.md",
	},
};

import type { TypstSettings } from "./typst/typstSettings";
import { DEFAULT_TYPST_SETTINGS } from "./typst/typstSettings";

export interface BonbonSettings {
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

export const BONBON_SETTINGS: BonbonSettings = {
	historyChars: {},
	enableCount: true,
	typst: DEFAULT_TYPST_SETTINGS,
	folderCheck: {
		enabled: false,
		targetPath: "TODO.md",
	},
};

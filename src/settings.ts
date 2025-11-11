import type { TypstSettings } from "./typst/typstSettings";
import { DEFAULT_TYPST_SETTINGS } from "./typst/typstSettings";

export interface BonbonSettings {
	historyChars: {
		[key: string]: number;
	};
	enableCount: boolean;
	typst: TypstSettings;
}

export const BONBON_SETTINGS: BonbonSettings = {
	historyChars: {},
	enableCount: true,
	typst: DEFAULT_TYPST_SETTINGS,
};

export interface BonbonSettings {
	historyChars: {
		[key: string]: number;
	};
	enableCount: boolean;
}

export const BONBON_SETTINGS: BonbonSettings = {
	historyChars: {},
	enableCount: true,
};

export type Vault = {
	adapter: {
		read: (path: string) => Promise<string>;
		exists: (path: string) => Promise<boolean>;
		mkdir?: (path: string) => Promise<void>;
		write?: (path: string, data: string) => Promise<void>;
		remove?: (path: string) => Promise<void>;
	};
};

export const normalizePath = (value: string): string =>
	value.replace(/\\/g, "/");

export class Notice {
	constructor(public message: string) {
		// eslint-disable-next-line no-console
		console.warn(message);
	}
}

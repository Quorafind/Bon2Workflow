import { defineConfig } from "vitest/config";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	test: {
		include: ["src/**/*.spec.ts"],
		environment: "node",
	},
	resolve: {
		alias: {
			obsidian: resolve(rootDir, "vitest.obsidian.ts"),
		},
	},
});

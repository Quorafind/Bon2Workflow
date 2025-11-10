export function executeSandbox(
	scriptCode: string,
	content: string
): string {
	try {
		const sandbox = new Function(
			"content",
			`"use strict";
const app = undefined;
const window = undefined;
const global = undefined;
${scriptCode}
if (typeof transform !== "function") {
	throw new Error("Script must define a transform() function");
}
return transform(content);`
		);

		return sandbox(content);
	} catch (error) {
		const message =
			error instanceof Error ? error.message : String(error);
		throw new Error(`Script execution failed: ${message}`);
	}
}


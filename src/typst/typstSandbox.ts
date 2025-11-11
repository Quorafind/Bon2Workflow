/**
 * Type definition: the convert function injected into the sandbox
 */
export type ConvertFunction = (markdown: string) => Promise<string>;

/**
 * Execute a user script in a sandboxed environment.
 *
 * @param scriptCode - The user script code
 * @param content - The input content (Markdown)
 * @param convertFn - Optional conversion function (AST transformer), injected as convertToTypst
 * @returns Promise resolving to the converted output
 */
export async function executeSandbox(
	scriptCode: string,
	content: string,
	convertFn?: ConvertFunction
): Promise<string> {
	try {
		// Use AsyncFunction constructor for async execution
		const AsyncFunction = Object.getPrototypeOf(
			async function () {}
		).constructor;

		// Create sandboxed function, injecting convertToTypst
		const sandbox = new AsyncFunction(
			"content",
			"convertToTypst",
			`"use strict";
const app = undefined;
const window = undefined;
const global = undefined;
${scriptCode}
if (typeof transform !== "function") {
	throw new Error("Script must define a transform() function");
}
return await transform(content);`
		);

		// Execute the sandbox, passing in content and convert function
		// If convertFn is not provided, use a no-op function (for backward compatibility)
		const defaultConvertFn = async (s: string) => s;
		return await sandbox(content, convertFn || defaultConvertFn);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`Script execution failed: ${message}`);
	}
}

/**
 * Typst CLI related error types
 */

/**
 * Error thrown when Typst CLI is not found in the system
 */
export class TypstNotFoundError extends Error {
	constructor(public suggestions: string[]) {
		super("Typst CLI not found");
		this.name = "TypstNotFoundError";
	}

	/**
	 * Format error message for user display
	 */
	toUserMessage(): string {
		return [
			"❌ Typst CLI not found in system PATH.",
			"",
			"🔧 Solutions:",
			...this.suggestions.map((s, i) => `  ${i + 1}. ${s}`),
		].join("\n");
	}
}

/**
 * Error thrown when the specified Typst CLI path is invalid
 */
export class TypstInvalidPathError extends Error {
	constructor(
		public path: string,
		public reason: string,
	) {
		super(`Invalid Typst CLI path: ${path}`);
		this.name = "TypstInvalidPathError";
	}

	/**
	 * Format error message for user display
	 */
	toUserMessage(): string {
		return `❌ Invalid Typst path: ${this.path}\n💡 ${this.reason}`;
	}
}

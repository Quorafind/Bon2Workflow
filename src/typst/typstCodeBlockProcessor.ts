/**
 * Typst code block processor
 * Renders Typst code blocks in Markdown reading mode
 */

import type { MarkdownPostProcessorContext } from "obsidian";
import type { TypstWasmRenderer } from "./typstWasmRenderer";

/**
 * Create Typst code block processor function
 * @param renderer WASM renderer instance
 * @returns Code block processing function
 */
export function createTypstCodeBlockProcessor(renderer: TypstWasmRenderer) {
	return async (
		source: string,
		el: HTMLElement,
		ctx: MarkdownPostProcessorContext
	) => {
		// Clear container
		el.empty();

		// Create render container
		const container = el.createDiv({
			cls: "typst-render-container",
		});

		// Show loading status
		const loadingEl = container.createDiv({
			cls: "typst-loading",
			text: "Rendering Typst...",
		});

		try {
			// Render SVG
			const svg = await renderer.renderToSVG(source.trim());

			// Remove loading indicator
			loadingEl.remove();

			// Insert SVG
			container.innerHTML = svg;
		} catch (error) {
			// Remove loading indicator
			loadingEl.remove();

			// Show error message
			renderError(container, error);
		}
	};
}

/**
 * Render error message
 * @param container Container element
 * @param error Error object
 */
function renderError(container: HTMLElement, error: unknown): void {
	const errorContainer = container.createDiv({
		cls: "typst-error",
	});

	// Error title
	errorContainer.createDiv({
		cls: "typst-error-title",
		text: "⚠️ Typst Compile Error",
	});

	// Error message
	const message = error instanceof Error ? error.message : String(error);
	errorContainer.createEl("pre", {
		cls: "typst-error-message",
		text: message,
	});
}

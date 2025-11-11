/**
 * Typst 代码块处理器
 * 用于在 Markdown 阅读模式中渲染 typst 代码块
 */

import type { MarkdownPostProcessorContext } from "obsidian";
import type { TypstWasmRenderer } from "./typstWasmRenderer";

/**
 * 创建 Typst 代码块处理器函数
 * @param renderer WASM 渲染器实例
 * @returns 代码块处理函数
 */
export function createTypstCodeBlockProcessor(renderer: TypstWasmRenderer) {
	return async (
		source: string,
		el: HTMLElement,
		ctx: MarkdownPostProcessorContext
	) => {
		// 清空容器
		el.empty();

		// 创建渲染容器
		const container = el.createDiv({
			cls: "typst-render-container",
		});

		// 显示加载状态
		const loadingEl = container.createDiv({
			cls: "typst-loading",
			text: "正在渲染 Typst...",
		});

		try {
			// 渲染 SVG
			const svg = await renderer.renderToSVG(source.trim());

			// 移除加载提示
			loadingEl.remove();

			// 插入 SVG
			container.innerHTML = svg;
		} catch (error) {
			// 移除加载提示
			loadingEl.remove();

			// 显示错误信息
			renderError(container, error);
		}
	};
}

/**
 * 渲染错误信息
 * @param container 容器元素
 * @param error 错误对象
 */
function renderError(container: HTMLElement, error: unknown): void {
	const errorContainer = container.createDiv({
		cls: "typst-error",
	});

	// 错误标题
	errorContainer.createDiv({
		cls: "typst-error-title",
		text: "⚠️ Typst 编译错误",
	});

	// 错误消息
	const message = error instanceof Error ? error.message : String(error);
	errorContainer.createEl("pre", {
		cls: "typst-error-message",
		text: message,
	});
}

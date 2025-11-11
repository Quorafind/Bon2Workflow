import type {
	EmbedDocumentNode,
	ObsidianBlockRefNode,
	ObsidianCalloutNode,
	ObsidianHighlightNode,
	ObsidianTagNode,
	GeneratorContext,
} from "../types";
import type { RenderChildren } from "./types";

function escapeAttribute(value: string): string {
	return value.replace(/"/g, '\\"');
}

function normalizeTypstPath(path: string): string {
	return path.replace(/\\/g, "/");
}

/**
 * 计算从 from 到 to 的相对路径
 */
function calculateRelativePath(from: string, to: string): string {
	const fromParts = from.replace(/\\/g, "/").split("/");
	const toParts = to.replace(/\\/g, "/").split("/");

	fromParts.pop(); // 移除文件名

	let commonLength = 0;
	const minLength = Math.min(fromParts.length, toParts.length);
	for (let i = 0; i < minLength; i++) {
		if (fromParts[i] === toParts[i]) {
			commonLength++;
		} else {
			break;
		}
	}

	const upLevels = fromParts.length - commonLength;
	const upPath = "../".repeat(upLevels);
	const downPath = toParts.slice(commonLength).join("/");

	return upPath + downPath;
}

function formatImageAttributes(
	options: EmbedDocumentNode["data"]["imageOptions"]
): string {
	if (!options) {
		return "";
	}

	const parts: string[] = [];
	if (options.width) {
		parts.push(`width: ${options.width}`);
	}
	if (options.height) {
		parts.push(`height: ${options.height}`);
	}
	if (typeof options.page === "number") {
		parts.push(`page: ${options.page}`);
	}

	return parts.length ? `, ${parts.join(", ")}` : "";
}

export function generateCallout(
	node: ObsidianCalloutNode,
	renderChildren: RenderChildren
): string {
	// 使用 Typst 原生 quote + 标题
	const typeLabel = node.calloutType.toUpperCase();
	const title = node.title || typeLabel;
	const content = renderChildren(node.children);

	return `#block(\n  fill: rgb("#f0f0f0"),\n  inset: 10pt,\n  radius: 4pt,\n  [\n    #text(weight: "bold")[${title}]\n    \n    ${content}\n  ]\n)\n\n`;
}

export function generateTag(node: ObsidianTagNode): string {
	// 直接输出标签文本，使用特殊格式
	return `#text(fill: rgb("#0066cc"))[\\#${escapeAttribute(node.value)}]`;
}

export function generateBlockRef(node: ObsidianBlockRefNode): string {
	// 块引用转为 label
	return `#label("${escapeAttribute(node.value)}")`;
}

export function generateHighlight(
	node: ObsidianHighlightNode,
	renderChildren: RenderChildren
): string {
	// 使用 Typst 内置的 highlight 函数
	const content = renderChildren(node.children);
	return `#highlight[${content}]`;
}

export function generateEmbedDocument(
	node: EmbedDocumentNode,
	renderChildren: RenderChildren,
	context: GeneratorContext
): string {
	const data = node.data ?? { originalPath: "", depth: 0 };
	const assetPath = data.originalPath || data.assetPath || "";

	// 图片/PDF：使用 #image() 并计算相对路径
	if (data.assetKind === "pdf" || data.assetKind === "image") {
		const typFilePath = context.currentFile.replace(/\.md$/i, ".typ");
		const relativePath = calculateRelativePath(typFilePath, assetPath);
		const normalizedPath = normalizeTypstPath(relativePath);

		const attributes = formatImageAttributes(data.imageOptions);
		return `#image("${escapeAttribute(normalizedPath)}"${attributes})\n\n`;
	}

	// 二进制文件：使用链接
	if (data.assetKind === "binary") {
		const typFilePath = context.currentFile.replace(/\.md$/i, ".typ");
		const relativePath = calculateRelativePath(typFilePath, assetPath);
		const normalizedPath = normalizeTypstPath(relativePath);
		return `#link("${escapeAttribute(normalizedPath)}")[Embedded file]\n\n`;
	}

	// Markdown 文件：使用已转换的 Typst 内容，包装在 quote 中
	if (data.assetKind === "markdown" && data.convertedTypst) {
		const normalizedPath = normalizeTypstPath(data.originalPath);
		const content = data.convertedTypst.trim();
		const source = data.originalPath
			? `\n\n#smallcaps("${escapeAttribute(normalizedPath)}")`
			: "";
		return `#quote[${content}${source}]\n\n`;
	}

	// 降级处理：使用 renderChildren（兼容旧逻辑）
	const quoted =
		renderChildren(node.children).trim() ||
		(data.originalPath ? `Embedded content from ${data.originalPath}` : "");

	if (!quoted) {
		return "";
	}

	const normalizedPath = normalizeTypstPath(data.originalPath);
	const source =
		data.originalPath && quoted
			? `\n\n#smallcaps("${escapeAttribute(normalizedPath)}")`
			: "";
	return `#quote[${quoted}${source}]\n\n`;
}

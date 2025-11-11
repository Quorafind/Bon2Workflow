import type { Image, Link } from "mdast";
import type { ObsidianWikiLinkNode, GeneratorContext } from "../types";
import type { RenderChildren } from "./types";

function escapeAttribute(value: string): string {
	return value.replace(/"/g, '\\"');
}

/**
 * 计算从 from 到 to 的相对路径
 * @param from 源文件路径（.typ 文件路径）
 * @param to 目标文件路径（图片路径）
 * @returns 相对路径
 */
function calculateRelativePath(from: string, to: string): string {
	// 规范化路径分隔符为 /
	const fromParts = from.replace(/\\/g, "/").split("/");
	const toParts = to.replace(/\\/g, "/").split("/");

	// 移除文件名，只保留目录
	fromParts.pop();

	// 找到公共前缀
	let commonLength = 0;
	const minLength = Math.min(fromParts.length, toParts.length);
	for (let i = 0; i < minLength; i++) {
		if (fromParts[i] === toParts[i]) {
			commonLength++;
		} else {
			break;
		}
	}

	// 计算需要向上的层数
	const upLevels = fromParts.length - commonLength;

	// 构建相对路径
	const upPath = "../".repeat(upLevels);
	const downPath = toParts.slice(commonLength).join("/");

	return upPath + downPath;
}

export function generateLink(
	node: Link,
	renderChildren: RenderChildren
): string {
	const label = renderChildren(node.children);
	return `#link("${escapeAttribute(node.url)}")[${label}]`;
}

export function generateImage(node: Image, context: GeneratorContext): string {
	const alt = node.alt ? `, alt: "${escapeAttribute(node.alt)}"` : "";

	// 计算相对路径
	let imagePath = node.url;

	// 如果 URL 不是绝对路径或 URL，计算相对路径
	if (!imagePath.startsWith("http://") && !imagePath.startsWith("https://") && !imagePath.startsWith("/")) {
		// 将 .typ 文件路径转换为实际路径（去掉 .md 加 .typ）
		const typFilePath = context.currentFile.replace(/\.md$/i, ".typ");
		imagePath = calculateRelativePath(typFilePath, imagePath);
	}

	return `#image("${escapeAttribute(imagePath)}"${alt})`;
}

export function generateWikiLink(node: ObsidianWikiLinkNode): string {
	const target = node.path ?? node.value;
	const display = node.alias ?? node.value;
	return `#link("${escapeAttribute(target)}")[${display}]`;
}

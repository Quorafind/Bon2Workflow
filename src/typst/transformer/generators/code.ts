import type { Code } from "mdast";

export function generateCodeBlock(node: Code): string {
	const lang = node.lang ?? "";
	const fence = "```";
	// 使用 Typst 原生代码块语法，更简洁且不需要转义
	return `${fence}${lang}\n${node.value}\n${fence}\n\n`;
}

import type { Code } from "mdast";

export function generateCodeBlock(node: Code): string {
	const lang = node.lang ?? "";

	// 特殊处理：typst/typ 代码块直接嵌入原始内容（让 Typst 执行渲染）
	if (lang === "typst" || lang === "typ") {
		return `${node.value}\n\n`;
	}

	// 其他语言代码块：使用 Typst 原生代码块语法显示
	const fence = "```";
	return `${fence}${lang}\n${node.value}\n${fence}\n\n`;
}

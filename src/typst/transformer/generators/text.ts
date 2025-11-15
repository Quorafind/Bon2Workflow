import type {
	Break,
	Emphasis,
	InlineCode,
	Paragraph,
	Strong,
	Text,
} from "mdast";
import type { GeneratorContext } from "../types";
import type { RenderChildren } from "./types";

// 在正则表达式字符类中，] 需要放在开头或者转义
// 这里使用 [\]...] 的形式，] 在开头紧跟左括号
const ESCAPE_PATTERN = /([\]#\[\\<>])/g;

// Cheq 支持的 checkbox 符号（24+ 种）
// 基础符号：' ', 'x', '/', '-'
// 扩展符号：'>', '<', '?', '!', '*', '"', 'l', 'b', 'i', 'S', 'I', 'p', 'c', 'f', 'k', 'w', 'u', 'd'
const CHEQ_CHECKBOX_PATTERN = /\[([x\/\-><?!*"lbiSIpcfkwud ])\]/g;

export function escapeTypstText(text: string): string {
	// 先保护 checkbox 标记
	const checkboxPlaceholders: string[] = [];
	const protected_ = text.replace(CHEQ_CHECKBOX_PATTERN, (match) => {
		const index = checkboxPlaceholders.length;
		checkboxPlaceholders.push(match);
		return `__CHECKBOX_${index}__`;
	});

	// 转义 Typst 特殊字符
	const escaped = protected_.replace(ESCAPE_PATTERN, "\\$1");

	// 恢复 checkbox 标记
	return escaped.replace(/__CHECKBOX_(\d+)__/g, (_, index) => {
		return checkboxPlaceholders[parseInt(index)];
	});
}

export function generateText(node: Text, _context: GeneratorContext): string {
	return escapeTypstText(node.value);
}

export function generateStrong(
	node: Strong,
	renderChildren: RenderChildren
): string {
	// 使用 Typst 原生语法：*text*
	const content = renderChildren(node.children);
	return `#strong[${content}]`;
}

export function generateEmphasis(
	node: Emphasis,
	renderChildren: RenderChildren
): string {
	// 使用 Typst 原生语法：_text_
	const content = renderChildren(node.children);
	return `_${content}_`;
}

export function generateParagraph(
	node: Paragraph,
	renderChildren: RenderChildren,
	context: GeneratorContext
): string {
	const children = renderChildren(node.children);

	// 列表项内的段落不添加 parbreak，保持列表连续性和层级缩进
	if (context.inListItem) {
		return children ? `${children}\n` : "";
	}

	// 普通段落使用 Typst 的 parbreak() 函数明确段落分隔
	// 多个连续的 parbreak() 会自动合并为一个
	return children ? `${children}\n#parbreak()\n` : "#parbreak()\n";
}

export function generateLineBreak(_node: Break): string {
	// 使用 Typst 原生语法：\ 换行
	return " \\\n";
}

export function generateInlineCode(node: InlineCode): string {
	// 使用 Typst 原生行内代码语法（反引号）
	// 如果代码中包含反引号，需要转义
	const escaped = node.value.replace(/`/g, "\\`");
	return "`" + escaped + "`";
}

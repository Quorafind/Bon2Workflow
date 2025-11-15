import type { List, ListItem } from "mdast";
import type { RenderChildren } from "./types";
import type { GeneratorContext } from "../types";

function formatListItem(
	item: ListItem,
	renderChildren: RenderChildren,
	ordered: boolean,
	indent: string = "",
	context: GeneratorContext
): string {
	const prefix = ordered ? "+" : "-";

	// 在列表项内部渲染时，设置 inListItem 标志
	const originalFlag = context.inListItem;
	context.inListItem = true;

	const content = renderChildren(item.children as unknown as ListItem["children"]).trim();

	// 恢复原始标志
	context.inListItem = originalFlag;

	if (typeof item.checked === "boolean") {
		const checkbox = item.checked ? "[x]" : "[ ]";
		return `${indent}${prefix} ${checkbox} ${content}\n`;
	}

	return `${indent}${prefix} ${content}\n`;
}

export function generateList(
	node: List,
	renderChildren: RenderChildren,
	context: GeneratorContext,
	indent: string = ""
): string {
	// 计算当前列表的缩进：每层嵌套增加2个空格（Typst 标准缩进）
	const currentIndent = "  ".repeat(context.listDepth);

	// 递增列表深度（用于嵌套列表）
	const originalDepth = context.listDepth;
	context.listDepth += 1;

	const items = node.children
		.map((item) => formatListItem(item, renderChildren, node.ordered ?? false, currentIndent, context))
		.join("");

	// 恢复列表深度
	context.listDepth = originalDepth;

	// 列表是块级元素，后面需要空行分隔
	return `${items}\n`;
}

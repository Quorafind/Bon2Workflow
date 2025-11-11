import type { List, ListItem } from "mdast";
import type { RenderChildren } from "./types";

function formatListItem(
	item: ListItem,
	renderChildren: RenderChildren,
	ordered: boolean,
	indent: string = ""
): string {
	const prefix = ordered ? "+" : "-";
	const content = renderChildren(item.children as unknown as ListItem["children"]).trim();

	if (typeof item.checked === "boolean") {
		const checkbox = item.checked ? "[x]" : "[ ]";
		return `${indent}${prefix} ${checkbox} ${content}\n`;
	}

	return `${indent}${prefix} ${content}\n`;
}

export function generateList(
	node: List,
	renderChildren: RenderChildren,
	indent: string = ""
): string {
	const items = node.children
		.map((item) => formatListItem(item, renderChildren, node.ordered ?? false, indent))
		.join("");

	// 列表是块级元素，后面需要空行分隔
	return `${items}\n`;
}

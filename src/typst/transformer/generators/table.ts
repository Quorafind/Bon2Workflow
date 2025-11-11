import type { Table, TableCell } from "mdast";
import type { RenderChildren } from "./types";

function renderCell(cell: TableCell, renderChildren: RenderChildren): string {
	return `[${renderChildren(cell.children)}]`;
}

export function generateTable(
	node: Table,
	renderChildren: RenderChildren
): string {
	const columns = node.children[0]?.children.length ?? 0;
	const align =
		node.align && node.align.length
			? `align: (${node.align
					.map((alignValue) => alignValue ?? "left")
					.join(", ")}), `
			: "";

	const rows = node.children
		.map((row) =>
			row.children.map((cell) => renderCell(cell, renderChildren)).join(", ")
		)
		.join(",\n");

	return `#table(${align}columns: ${columns}, ${rows})\n\n`;
}

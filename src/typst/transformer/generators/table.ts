import type { Table, TableCell } from "mdast";
import type { RenderChildren } from "./types";

function renderCell(cell: TableCell, renderChildren: RenderChildren): string {
	return `[${renderChildren(cell.children)}]`;
}

export function generateTable(
	node: Table,
	renderChildren: RenderChildren
): string {
	// 计算列数并处理空表格边界情况
	const columns = node.children[0]?.children.length ?? 0;
	if (columns === 0 || node.children.length === 0) {
		return "// Empty table omitted\n\n";
	}

	// 处理列对齐参数（可选）
	const align =
		node.align && node.align.length
			? `align: (${node.align
					.map((alignValue) => alignValue ?? "left")
					.join(", ")}), `
			: "";

	// 渲染表头行（第一行，内容自动加粗）
	const headerRow = node.children[0].children
		.map((cell) => `[*${renderChildren(cell.children)}*]`)
		.join(", ");

	// 渲染数据行（从第二行开始）
	const dataRows = node.children
		.slice(1)
		.map((row) =>
			row.children
				.map((cell) => renderCell(cell, renderChildren))
				.join(", ")
		)
		.join(",\n  ");

	// 组合所有行（表头 + 数据行）
	const rows = headerRow + (dataRows ? ",\n  " + dataRows : "");

	// 生成 Typst 表格代码（多行格式，包含边框）
	return `#table(
  ${align}columns: ${columns},
  stroke: 0.5pt,
  ${rows}
)\n\n`;
}

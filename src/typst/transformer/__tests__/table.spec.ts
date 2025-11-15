import { describe, expect, it } from "vitest";
import type { App, Vault } from "obsidian";
import { markdownToTypst, type EmbedEnvironment } from "../../transformer";

function createBasicEnvironment(): EmbedEnvironment {
	const vault = {
		adapter: {
			read: async () => "",
			exists: async () => false,
		},
	} as unknown as Vault;

	return {
		vault,
		app: { vault } as unknown as App,
		currentFile: "test.md",
		resolveFilePath: async () => null,
	};
}

describe("Table generation", () => {
	it("generates table with stroke border parameter", async () => {
		const env = createBasicEnvironment();
		const markdown = `| Name | Age |
|------|-----|
| Alice | 30 |
| Bob | 25 |`;

		const result = await markdownToTypst(markdown, {}, env);

		// 验证包含 stroke 参数
		expect(result).toContain("stroke: 0.5pt");
	});

	it("generates table with bold header row", async () => {
		const env = createBasicEnvironment();
		const markdown = `| Name | Age |
|------|-----|
| Alice | 30 |`;

		const result = await markdownToTypst(markdown, {}, env);

		// 验证表头加粗
		expect(result).toContain("[*Name*]");
		expect(result).toContain("[*Age*]");
	});

	it("generates table with alignment parameters", async () => {
		const env = createBasicEnvironment();
		const markdown = `| Left | Center | Right |
|:-----|:------:|------:|
| A | B | C |`;

		const result = await markdownToTypst(markdown, {}, env);

		// 验证对齐参数
		expect(result).toContain("align: (left, center, right)");
	});

	it("handles empty table gracefully", async () => {
		const env = createBasicEnvironment();
		const markdown = `| Header |
|--------|`;

		const result = await markdownToTypst(markdown, {}, env);

		// 空表格应该被处理（只有表头的情况）
		expect(result).toBeTruthy();
		expect(result).toContain("[*Header*]");
	});

	it("generates multi-line formatted output", async () => {
		const env = createBasicEnvironment();
		const markdown = `| A | B |
|---|---|
| 1 | 2 |`;

		const result = await markdownToTypst(markdown, {}, env);

		// 验证多行格式
		expect(result).toContain("#table(\n");
		expect(result).toContain("columns:");
		expect(result).toContain("stroke:");
	});

	it("preserves complex cell content", async () => {
		const env = createBasicEnvironment();
		const markdown = `| Feature | Status |
|---------|--------|
| **Bold** | Text |`;

		const result = await markdownToTypst(markdown, {}, env);

		// 验证表头加粗
		expect(result).toContain("[*Feature*]");
		expect(result).toContain("[*Status*]");
		// 验证单元格内的加粗内容（被转换为 #strong[] 语法）
		expect(result).toContain("#strong[Bold]");
	});
});

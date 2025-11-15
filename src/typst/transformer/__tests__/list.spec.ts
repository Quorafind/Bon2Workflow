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

describe("List generation - parbreak behavior", () => {
	it("should NOT generate parbreak in simple unordered list items", async () => {
		const env = createBasicEnvironment();
		const markdown = `- Item 1
- Item 2
- Item 3`;

		const result = await markdownToTypst(markdown, {}, env);

		// 列表项内不应该有 parbreak
		expect(result).not.toContain("#parbreak()");
		// 应该包含列表标记
		expect(result).toContain("- Item 1");
		expect(result).toContain("- Item 2");
		expect(result).toContain("- Item 3");
	});

	it("should NOT generate parbreak in ordered list items", async () => {
		const env = createBasicEnvironment();
		const markdown = `1. First
2. Second
3. Third`;

		const result = await markdownToTypst(markdown, {}, env);

		// 列表项内不应该有 parbreak
		expect(result).not.toContain("#parbreak()");
		// 应该包含有序列表标记
		expect(result).toContain("+ First");
		expect(result).toContain("+ Second");
		expect(result).toContain("+ Third");
	});

	it("should NOT generate parbreak in nested lists", async () => {
		const env = createBasicEnvironment();
		const markdown = `- Parent 1
  - Child 1
  - Child 2
- Parent 2
  - Child 3`;

		const result = await markdownToTypst(markdown, {}, env);

		// 嵌套列表项内不应该有 parbreak
		expect(result).not.toContain("#parbreak()");
		// 验证列表结构
		expect(result).toContain("- Parent 1");
		expect(result).toContain("  - Child 1"); // 子列表应该有2个空格缩进
		expect(result).toContain("  - Child 2");
		expect(result).toContain("- Parent 2");
		expect(result).toContain("  - Child 3");
	});

	it("should generate correct indentation for deeply nested lists", async () => {
		const env = createBasicEnvironment();
		const markdown = `- Level 1
  - Level 2
    - Level 3
      - Level 4`;

		const result = await markdownToTypst(markdown, {}, env);

		// 验证各层级的缩进（每层2个空格）
		expect(result).toContain("- Level 1");
		expect(result).toContain("  - Level 2");
		expect(result).toContain("    - Level 3");
		expect(result).toContain("      - Level 4");
		expect(result).not.toContain("#parbreak()");
	});

	it("should generate parbreak for paragraphs outside lists", async () => {
		const env = createBasicEnvironment();
		const markdown = `This is a paragraph.

Another paragraph.`;

		const result = await markdownToTypst(markdown, {}, env);

		// 普通段落应该有 parbreak
		expect(result).toContain("#parbreak()");
		expect(result).toContain("This is a paragraph.");
		expect(result).toContain("Another paragraph.");
	});

	it("should handle mixed lists and paragraphs correctly", async () => {
		const env = createBasicEnvironment();
		const markdown = `Introduction paragraph.

- List item 1
- List item 2

Conclusion paragraph.`;

		const result = await markdownToTypst(markdown, {}, env);

		// 段落应该有 parbreak
		const paragraphMatches = result.match(/#parbreak\(\)/g);
		expect(paragraphMatches).toBeTruthy();
		expect(paragraphMatches!.length).toBeGreaterThan(0);

		// 列表项应该存在
		expect(result).toContain("- List item 1");
		expect(result).toContain("- List item 2");
		expect(result).toContain("Introduction paragraph.");
		expect(result).toContain("Conclusion paragraph.");
	});

	it("should NOT generate parbreak in checkbox list items", async () => {
		const env = createBasicEnvironment();
		const markdown = `- [ ] Unchecked task
- [x] Checked task
- [/] In progress`;

		const result = await markdownToTypst(markdown, {}, env);

		// Checkbox 列表项内不应该有 parbreak
		expect(result).not.toContain("#parbreak()");
		// 验证 checkbox 标记
		expect(result).toContain("[ ] Unchecked task");
		expect(result).toContain("[x] Checked task");
		expect(result).toContain("[/] In progress");
	});

	it("should handle complex nested structure without parbreak in lists", async () => {
		const env = createBasicEnvironment();
		const markdown = `- Level 1 item
  - Level 2 item
    - Level 3 item
  - Back to Level 2
- Another Level 1 item`;

		const result = await markdownToTypst(markdown, {}, env);

		// 多层嵌套列表项内不应该有 parbreak
		expect(result).not.toContain("#parbreak()");
		expect(result).toContain("- Level 1 item");
		expect(result).toContain("- Level 2 item");
		expect(result).toContain("- Level 3 item");
	});

	it("should maintain list continuity for multi-paragraph list items", async () => {
		const env = createBasicEnvironment();
		const markdown = `- Item with first paragraph

  Item with second paragraph in same list item

- Next list item`;

		const result = await markdownToTypst(markdown, {}, env);

		// 列表项内的多段落不应该生成 parbreak（保持列表连续性）
		expect(result).not.toContain("#parbreak()");
		expect(result).toContain("Item with first paragraph");
		expect(result).toContain("Item with second paragraph in same list item");
		expect(result).toContain("- Next list item");
	});

	it("should preserve proper spacing between paragraphs and lists", async () => {
		const env = createBasicEnvironment();
		const markdown = `First paragraph.

- List item 1
- List item 2

Second paragraph.

- Another list item`;

		const result = await markdownToTypst(markdown, {}, env);

		// 段落有 parbreak
		expect(result).toContain("#parbreak()");
		// 列表标记存在
		expect(result).toContain("- List item 1");
		expect(result).toContain("- Another list item");
		// 验证整体结构正确
		expect(result).toContain("First paragraph.");
		expect(result).toContain("Second paragraph.");
	});
});

import { describe, expect, it } from "vitest";
import type { App, Vault } from "obsidian";
import { markdownToTypst, type EmbedEnvironment } from "../../transformer";

interface EmbedFixture {
	content?: string;
	isMarkdown?: boolean;
}

function createEmbedEnvironment(
	files: Record<string, EmbedFixture>
): EmbedEnvironment {
	const vault = {
		adapter: {
			read: async (path: string) => {
				const entry = files[path];
				if (!entry) {
					throw new Error(`File not found: ${path}`);
				}
				return entry.content ?? "";
			},
			exists: async (path: string) => Boolean(files[path]),
		},
	} as unknown as Vault;

	return {
		vault,
		app: {
			vault: vault,
		} as unknown as App,
		currentFile: "Home.md",
		resolveFilePath: async (link: string) => {
			const normalized = link.trim();
			const entry = files[normalized];
			if (!entry) {
				return null;
			}
			const extension = normalized.split(".").pop() ?? "";
			return {
				path: normalized,
				extension,
				isMarkdown:
					entry.isMarkdown ?? extension.toLowerCase() === "md",
			};
		},
	};
}

describe("markdownToTypst embeds", () => {
	it("renders Markdown embeds as block quotes with source hint", async () => {
		const env = createEmbedEnvironment({
			"docs/embed.md": {
				content: "# Embedded Title\n\nDetails line",
				isMarkdown: true,
			},
		});

		const result = await markdownToTypst(
			"Intro paragraph.\n\n![[docs/embed.md]]",
			{},
			env
		);

		expect(result).toContain("#quote[");
		expect(result).toContain("Embedded Title");
		expect(result).toContain('#smallcaps("docs/embed.md")');
	});

	it("renders PDF embeds as #image blocks", async () => {
		const env = createEmbedEnvironment({
			"assets/chart1.pdf": {
				isMarkdown: false,
			},
		});

		const result = await markdownToTypst(
			"![[assets/chart1.pdf|page=2,width=120pt]]",
			{},
			env
		);

		expect(result).toContain(
			'#image("assets/chart1.pdf", width: 120pt, page: 2)'
		);
	});
});

describe("markdownToTypst special character escaping", () => {
	it("escapes < and > characters in text", async () => {
		const env = createEmbedEnvironment({});

		const result = await markdownToTypst(
			"Temperature range: 960~1060℃, Formula: 0<x<0.1 and y>5",
			{},
			env
		);

		// < and > should be escaped in text to avoid Typst label parsing errors
		expect(result).toContain("\\<");
		expect(result).toContain("\\>");
	});

	it("does not escape < > in heading labels", async () => {
		const env = createEmbedEnvironment({});

		const result = await markdownToTypst(
			"# Heading with special chars: x<y",
			{},
			env
		);

		// Heading should have a label like <heading-with-special-chars-x-y>
		// The label delimiters < > should NOT be escaped
		expect(result).toMatch(/= .*<[\w-]+>/);
		// But the < in the heading content should be escaped
		expect(result).toContain("\\<");
	});

	it("escapes other special characters", async () => {
		const env = createEmbedEnvironment({});

		// 使用 [link] 这样的非 checkbox 模式来测试方括号转义
		// 注意：单独的 [ ] 会被识别为 checkbox 标记而被保护
		const result = await markdownToTypst(
			"Special chars: # [link text] and \\backslash",
			{},
			env
		);

		expect(result).toContain("\\#");
		// [link text] 中的方括号应该被转义
		expect(result).toContain("\\[");
		expect(result).toContain("\\]");
		expect(result).toContain("\\\\");
	});

	it("preserves checkbox markers without escaping brackets", async () => {
		const env = createEmbedEnvironment({});

		const result = await markdownToTypst(
			"- [ ] Task with [ ] checkbox pattern",
			{},
			env
		);

		// Checkbox patterns should NOT have escaped brackets
		expect(result).toContain("[ ]");
		// The checkbox pattern regex should protect these from escaping
		expect(result).not.toContain("\\[ \\]");
	});
});

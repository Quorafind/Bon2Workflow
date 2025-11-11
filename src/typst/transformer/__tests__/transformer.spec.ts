import { describe, expect, it } from "vitest";
import type { Vault } from "obsidian";
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

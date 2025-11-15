import type {
	Blockquote,
	Break,
	Code,
	Emphasis,
	Heading,
	Image,
	InlineCode,
	Link,
	List,
	ListItem,
	Paragraph,
	Root,
	Strong,
	Table,
	Text,
} from "mdast";
import type { Content } from "mdast";
import { visit } from "unist-util-visit";
import type {
	EmbedDocumentNode,
	ObsidianBlockRefNode,
	ObsidianCalloutNode,
	ObsidianHighlightNode,
	ObsidianTagNode,
	ObsidianWikiLinkNode,
	TypstAstNode,
	InlineMathNode,
	MathNode,
	TypstTransformOptions,
} from "./types";
import type { GeneratorContext } from "./types";
import {
	generateCallout,
	generateHeading,
	generateParagraph,
	generateText,
	generateStrong,
	generateEmphasis,
	generateInlineCode,
	generateLineBreak,
	generateLink,
	generateImage,
	generateWikiLink,
	generateList,
	generateTable,
	generateCodeBlock,
	generateInlineMath,
	generateMath,
	generateTag,
	generateBlockRef,
	generateHighlight,
	generateEmbedDocument,
} from "./generators";

type AnyNode =
	| TypstAstNode
	| Root
	| Paragraph
	| Text
	| Strong
	| Emphasis
	| Heading
	| Link
	| Image
	| Code
	| List
	| Table
	| Blockquote;

export class TypstGenerator {
	private readonly context: GeneratorContext;

	constructor(options: TypstTransformOptions, currentFile: string) {
		this.context = {
			options,
			currentDepth: 0,
			inCodeBlock: false,
			inListItem: false,
			listDepth: 0,
			collectedLabels: new Set(),
			currentFile,
		};
	}

	/**
	 * 检测 AST 中是否包含 checkbox
	 * 用于决定是否需要导入 cheq 包
	 */
	private hasCheckboxes(tree: Root): boolean {
		let hasCheckbox = false;
		visit(tree, "listItem", (node: ListItem) => {
			if (node.checked !== undefined && node.checked !== null) {
				hasCheckbox = true;
				return false; // 提前退出遍历
			}
		});
		return hasCheckbox;
	}

	generate(root: Root): string {
		let output = "";

		// 检测是否需要导入 cheq 包（支持扩展 checkbox）
		// 仅在启用增强功能且文档包含 checkbox 时导入
		if (this.context.options.enableCheckboxEnhancement && this.hasCheckboxes(root)) {
			output += '#import "@preview/cheq:0.3.0": checklist\n';
			output += "#show: checklist.with(extras: true)\n\n";
		}

		const result = this.renderChildren(root.children as Content[]);

		// 清理连续的多余空行
		// Typst 会自动处理多个连续的 parbreak()，这里只需要清理格式
		return (output + result).replace(/\n{3,}/g, "\n\n").trim() + "\n";
	}

	private renderChildren = (children: Content[]): string => {
		return children
			.map((child) => this.visitNode(child as AnyNode))
			.join("");
	};

	private visitNode(node: AnyNode): string {
		switch (node.type) {
			case "root":
				return this.renderChildren(
					(node as Root).children as Content[]
				);
			case "paragraph":
				return generateParagraph(
					node as Paragraph,
					this.renderChildren,
					this.context
				);
			case "text":
				return generateText(node as Text, this.context);
			case "strong":
				return generateStrong(node as Strong, this.renderChildren);
			case "emphasis":
				return generateEmphasis(node as Emphasis, this.renderChildren);
			case "break":
				return generateLineBreak(node as Break);
			case "inlineCode":
				return generateInlineCode(node as InlineCode);
			case "code":
				return generateCodeBlock(node as Code);
			case "heading":
				return generateHeading(
					node as Heading,
					this.context,
					this.renderChildren
				);
			case "list":
				return generateList(node as List, this.renderChildren, this.context);
			case "table":
				return generateTable(node as Table, this.renderChildren);
			case "link":
				return generateLink(node as Link, this.renderChildren);
			case "image":
				return generateImage(node as Image, this.context);
			case "inlineMath":
				return generateInlineMath(node as InlineMathNode);
			case "math":
				return generateMath(node as MathNode);
			case "callout":
				return generateCallout(
					node as ObsidianCalloutNode,
					this.renderChildren
				);
			case "obsidianTag":
				return generateTag(node as ObsidianTagNode);
			case "obsidianBlockRef":
				return generateBlockRef(node as ObsidianBlockRefNode);
			case "obsidianHighlight":
				return generateHighlight(
					node as ObsidianHighlightNode,
					this.renderChildren
				);
			case "embedDocument":
				return generateEmbedDocument(
					node as EmbedDocumentNode,
					this.renderChildren,
					this.context
				);
			case "wikiLink":
				return generateWikiLink(node as ObsidianWikiLinkNode);
			case "blockquote":
				const content = this.renderChildren(
					(node as Blockquote).children as Content[]
				);
				// 移除 quote 内部段落末尾多余的 #parbreak()
				const cleaned = content.replace(/\n#parbreak\(\)\n$/, "");
				return `#quote[${cleaned}]\n\n`;
			case "thematicBreak":
				return "#line(length: 100%, stroke: (paint: gray, thickness: 0.2pt))\n\n";
			default:
				return "";
		}
	}
}

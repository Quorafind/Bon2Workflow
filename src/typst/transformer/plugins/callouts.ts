import type { Plugin } from "unified";
import { visit } from "unist-util-visit";
import type { Blockquote, Paragraph, Root, Text } from "mdast";
import type { ObsidianCalloutNode } from "../types";

const CALLOUT_PATTERN = /^\s*\[!([a-zA-Z-]+)\]\s*(.*)$/;

function extractCalloutMeta(
	paragraph: Paragraph
): { type: string; title?: string } | null {
	const firstChild = paragraph.children[0];
	if (!firstChild || firstChild.type !== "text") {
		return null;
	}

	const textChild = firstChild as Text;
	const match = CALLOUT_PATTERN.exec(textChild.value);
	if (!match) {
		return null;
	}

	textChild.value = textChild.value.slice(match[0].length).trimStart();
	if (!textChild.value) {
		paragraph.children.shift();
	}

	return {
		type: match[1].toLowerCase(),
		title: match[2]?.trim() || undefined,
	};
}

export const remarkCallouts: Plugin<[], Root> = () => {
	return (tree) => {
		visit(tree, "blockquote", (node, index, parent) => {
			if (!parent || typeof index !== "number") {
				return;
			}

			const blockquote = node as Blockquote;
			const firstParagraph = blockquote.children[0];
			if (!firstParagraph || firstParagraph.type !== "paragraph") {
				return;
			}

			const meta = extractCalloutMeta(firstParagraph as Paragraph);
			if (!meta) {
				return;
			}

			const calloutNode: ObsidianCalloutNode = {
				type: "callout",
				calloutType: meta.type,
				title: meta.title,
				children: blockquote.children,
			};

			parent.children.splice(index, 1, calloutNode);
		});

		return tree;
	};
};

import type { Plugin } from "unified";
import { visit } from "unist-util-visit";
import type { Root, Text } from "mdast";
import type { ObsidianHighlightNode } from "../types";
import { replaceInTextNode } from "./utils";

const HIGHLIGHT_PATTERN = /==([\s\S]+?)==/g;

export const remarkHighlights: Plugin<[], Root> = () => {
	return (tree) => {
		visit(tree, "text", (node, index, parent) => {
			if (!parent || typeof index !== "number") {
				return;
			}

			const textNode = node as Text;
			if (!textNode.value.includes("==")) {
				return;
			}

			replaceInTextNode(
				parent,
				index,
				HIGHLIGHT_PATTERN,
				(match): ObsidianHighlightNode => ({
					type: "obsidianHighlight",
					children: [
						{
							type: "text",
							value: match[1],
						},
					],
				})
			);
		});

		return tree;
	};
};

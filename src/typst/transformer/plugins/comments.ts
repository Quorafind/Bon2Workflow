import type { Plugin } from "unified";
import { visit } from "unist-util-visit";
import type { Root, Text } from "mdast";
import { replaceInTextNode } from "./utils";

const COMMENT_PATTERN = /%%[\s\S]*?%%/g;

export const remarkComments: Plugin<[], Root> = () => {
	return (tree) => {
		visit(tree, "text", (node, index, parent) => {
			if (!parent || typeof index !== "number") {
				return;
			}

			const textNode = node as Text;
			if (!textNode.value.includes("%%")) {
				return;
			}

			replaceInTextNode(parent, index, COMMENT_PATTERN, () => []);
		});

		return tree;
	};
};

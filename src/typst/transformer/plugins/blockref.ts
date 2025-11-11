import type { Plugin } from "unified";
import { visit } from "unist-util-visit";
import type { Root, Text } from "mdast";
import type { ObsidianBlockRefNode } from "../types";
import { replaceInTextNode } from "./utils";

const BLOCK_REF_PATTERN = /\^([a-zA-Z0-9-]+)/g;

export const remarkBlockRefs: Plugin<[], Root> = () => {
	return (tree) => {
		visit(tree, "text", (node, index, parent) => {
			if (!parent || typeof index !== "number") {
				return;
			}

			const textNode = node as Text;
			if (!textNode.value.includes("^")) {
				return;
			}

			replaceInTextNode(
				parent,
				index,
				BLOCK_REF_PATTERN,
				(match): ObsidianBlockRefNode => ({
					type: "obsidianBlockRef",
					value: match[1],
				})
			);
		});

		return tree;
	};
};

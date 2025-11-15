import type { Plugin } from "unified";
import { visit } from "unist-util-visit";
import type { Root, Text } from "mdast";
import type { ObsidianTagNode } from "../types";
import { replaceInTextNode } from "./utils";

// Match Obsidian tags, but exclude Typst function/variable calls
// Negative lookahead (?![.([]) ensures we don't match:
// - #func() - Typst function call
// - #var.prop - Typst property access
// - #arr[idx] - Typst array/dict access
const TAG_PATTERN = /(?<!\S)#([A-Za-z0-9_\-/]+)(?![.([[])/g;

const EXCLUDED_PARENTS = new Set(["heading", "inlineCode", "code"]);

export const remarkTags: Plugin<[], Root> = () => {
	return (tree) => {
		visit(tree, "text", (node, index, parent) => {
			if (
				!parent ||
				typeof index !== "number" ||
				EXCLUDED_PARENTS.has(parent.type)
			) {
				return;
			}

			const textNode = node as Text;
			if (!textNode.value.includes("#")) {
				return;
			}

			replaceInTextNode(
				parent,
				index,
				TAG_PATTERN,
				(match): ObsidianTagNode => ({
					type: "obsidianTag",
					value: match[1],
				})
			);
		});

		return tree;
	};
};

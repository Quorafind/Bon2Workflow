import type { Plugin } from "unified";
import { visit } from "unist-util-visit";
import type { Root, Text } from "mdast";
import { replaceInTextNode } from "./utils";
import type { ObsidianWikiLinkNode } from "../types";

const WIKI_LINK_PATTERN = /\[\[([^[\]]+)\]\]/g;

function buildWikiLinkNode(matchValue: string): ObsidianWikiLinkNode {
	const [targetPartRaw, aliasPart] = matchValue.split("|");
	const targetPart = targetPartRaw.trim();
	const [pathPart, ...headingParts] = targetPart.split("#");
	const path = pathPart.trim();

	const heading =
		headingParts.length > 0
			? headingParts.join("#").trim() || undefined
			: undefined;

	const alias = aliasPart?.trim();

	return {
		type: "wikiLink",
		value: alias ?? (heading ?? path),
		alias,
		path: path.trim(),
		heading,
	};
}

export const remarkWikiLinks: Plugin<[], Root> = () => {
	return (tree) => {
		visit(tree, "text", (node, index, parent) => {
			if (!parent || typeof index !== "number") {
				return;
			}

			const textNode = node as Text;
			if (!textNode.value.includes("[[")) {
				return;
			}

			replaceInTextNode(
				parent,
				index,
				WIKI_LINK_PATTERN,
				(match): ObsidianWikiLinkNode => {
					return buildWikiLinkNode(match[1]);
				}
			);
		});

		return tree;
	};
};

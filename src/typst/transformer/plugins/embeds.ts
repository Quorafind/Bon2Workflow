import type { Plugin } from "unified";
import { visit } from "unist-util-visit";
import type { Root, Text } from "mdast";
import type { EmbedDocumentNode } from "../types";
import { replaceInTextNode } from "./utils";

const EMBED_PATTERN = /!\[\[([^[\]]+)\]\]/g;

function parseEmbedTarget(target: string): Pick<
	EmbedDocumentNode["data"],
	"originalPath" | "alias" | "heading" | "parameters" | "rawTarget"
> {
	const [pathAndHeading, parameterPart] = target.split("|");
	const [path, ...headingParts] = pathAndHeading.split("#");
	const originalPath = path.trim();
	const heading =
		headingParts.length > 0
			? headingParts.join("#").trim() || undefined
			: undefined;

	const parameters = parameterPart?.trim() || undefined;

	return {
		originalPath,
		alias: undefined,
		heading,
		parameters,
		rawTarget: target,
	};
}

export const remarkEmbeds: Plugin<[], Root> = () => {
	return (tree) => {
		visit(tree, "text", (node, index, parent) => {
			if (!parent || typeof index !== "number") {
				return;
			}

			const textNode = node as Text;
			if (!textNode.value.includes("![[") || !textNode.value.includes("]]")) {
				return;
			}

			replaceInTextNode(
				parent,
				index,
				EMBED_PATTERN,
				(match): EmbedDocumentNode => ({
					type: "embedDocument",
					data: {
						originalPath: "",
						depth: 0,
						...parseEmbedTarget(match[1]),
					},
					children: [],
				})
			);
		});

		return tree;
	};
};

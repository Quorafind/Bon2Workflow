import type { Parent, RootContent, Text } from "mdast";

export type TextReplacementBuilder =
	| ((match: RegExpExecArray) => RootContent)
	| ((match: RegExpExecArray) => RootContent[]);

export function replaceInTextNode(
	parent: Parent,
	index: number,
	pattern: RegExp,
	builder: TextReplacementBuilder
): boolean {
	const node = parent.children[index];
	if (!node || node.type !== "text") {
		return false;
	}

	const textNode = node as Text;
	const value = textNode.value;
	if (!pattern.global) {
		throw new Error("Pattern must be global");
	}

	let lastIndex = 0;
	const replacements: RootContent[] = [];
	pattern.lastIndex = 0;
	let match = pattern.exec(value);

	while (match) {
		if (match.index > lastIndex) {
			replacements.push({
				type: "text",
				value: value.slice(lastIndex, match.index),
			});
		}

		const built = builder(match);
		if (Array.isArray(built)) {
			replacements.push(...built);
		} else {
			replacements.push(built);
		}

		lastIndex = match.index + match[0].length;
		match = pattern.exec(value);
	}

	if (!replacements.length) {
		return false;
	}

	if (lastIndex < value.length) {
		replacements.push({
			type: "text",
			value: value.slice(lastIndex),
		});
	}

	parent.children.splice(index, 1, ...replacements);
	return true;
}

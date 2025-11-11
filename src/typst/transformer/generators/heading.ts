import type { Heading } from "mdast";
import { toString } from "mdast-util-to-string";
import type { GeneratorContext } from "../types";
import type { RenderChildren } from "./types";

function slugify(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/(^-|-$)/g, "");
}

function ensureLabel(context: GeneratorContext, base: string): string {
	const prefix = context.options.labelPrefix ?? "";
	let label = `${prefix}${base}`;
	let counter = 2;

	while (context.collectedLabels.has(label)) {
		label = `${prefix}${base}-${counter}`;
		counter += 1;
	}

	context.collectedLabels.add(label);
	return label;
}

export function generateHeading(
	node: Heading,
	context: GeneratorContext,
	renderChildren: RenderChildren
): string {
	const text = toString(node).trim();
	const slug = text ? slugify(text) : "";

	const typstLevel = Math.max(1, context.options.h1Level + node.depth - 1);
	const content = renderChildren(node.children);

	// 使用 Typst 原生语法：= Heading
	const prefix = "=".repeat(typstLevel);
	let result = `${prefix} ${content}`;

	if (slug) {
		const label = ensureLabel(context, slug);
		result += ` <${label}>`;
	}

	return `${result}\n\n`;
}

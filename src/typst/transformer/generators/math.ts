import type { MathNode, InlineMathNode } from "../types";

export function generateInlineMath(node: InlineMathNode): string {
	return `$${node.value}$`;
}

export function generateMath(node: MathNode): string {
	return `$${node.value}$\n\n`;
}

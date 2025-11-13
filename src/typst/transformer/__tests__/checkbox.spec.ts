import { describe, expect, it } from "vitest";
import { markdownToTypst } from "../index";

describe("Checkbox Extended Support (Cheq)", () => {
	it("should import cheq package when checkboxes are present and enhancement enabled", async () => {
		const markdown = `
- [ ] Task 1
- [x] Task 2
		`;

		const result = await markdownToTypst(markdown, {
			enableCheckboxEnhancement: true,
		});

		expect(result).toContain('#import "@preview/cheq:0.3.0": checklist');
		expect(result).toContain('#show: checklist.with(extras: true)');
	});

	it("should NOT import cheq package when enhancement is disabled", async () => {
		const markdown = `
- [ ] Task 1
- [x] Task 2
		`;

		const result = await markdownToTypst(markdown, {
			enableCheckboxEnhancement: false,
		});

		expect(result).not.toContain('#import "@preview/cheq:0.3.0"');
		expect(result).not.toContain('checklist');
		// But should still contain checkbox markers
		expect(result).toContain('[ ]');
		expect(result).toContain('[x]');
	});

	it("should NOT import cheq when no checkboxes present", async () => {
		const markdown = `
- Regular list item
- Another item
		`;

		const result = await markdownToTypst(markdown);

		expect(result).not.toContain('#import "@preview/cheq:0.3.0"');
		expect(result).not.toContain('checklist');
	});

	it("should preserve basic GFM checkboxes", async () => {
		const markdown = `
- [ ] Unchecked task
- [x] Checked task
		`;

		const result = await markdownToTypst(markdown);

		expect(result).toContain('[ ] Unchecked task');
		expect(result).toContain('[x] Checked task');
	});

	it("should preserve extended cheq basic symbols", async () => {
		const markdown = `
- [/] In progress
- [-] Canceled
		`;

		const result = await markdownToTypst(markdown);

		expect(result).toContain('[/] In progress');
		expect(result).toContain('[-] Canceled');
	});

	it("should preserve cheq extras symbols", async () => {
		const markdown = `
- [>] Forwarded
- [<] Scheduling
- [?] Question
- [!] Important
- [*] Star
- [k] Key
- [w] Win
		`;

		const result = await markdownToTypst(markdown);

		expect(result).toContain('[>] Forwarded');
		expect(result).toContain('[<] Scheduling');
		expect(result).toContain('[?] Question');
		expect(result).toContain('[!] Important');
		expect(result).toContain('[*] Star');
		expect(result).toContain('[k] Key');
		expect(result).toContain('[w] Win');
	});

	it("should handle mixed checkbox and regular list items", async () => {
		const markdown = `
- [ ] Checkbox item
- Regular item
- [x] Another checkbox
- Another regular item
		`;

		const result = await markdownToTypst(markdown);

		expect(result).toContain('[ ] Checkbox item');
		expect(result).toContain('Regular item');
		expect(result).toContain('[x] Another checkbox');
		expect(result).toContain('Another regular item');
	});

	it("should handle nested checkboxes", async () => {
		const markdown = `
- [x] Parent task
  - [ ] Child task 1
  - [/] Child task 2
  - [x] Child task 3
		`;

		const result = await markdownToTypst(markdown);

		expect(result).toContain('[x] Parent task');
		expect(result).toContain('[ ] Child task 1');
		expect(result).toContain('[/] Child task 2');
		expect(result).toContain('[x] Child task 3');
	});

	it("should handle all 24+ checkbox symbols", async () => {
		const markdown = `
## Basic
- [ ] Space
- [x] Checked
- [/] Slash
- [-] Dash

## Extras
- [>] Forward
- [<] Back
- [?] Question
- [!] Exclamation
- [*] Star
- ["] Quote
- [l] Location
- [b] Bookmark
- [i] Info
- [S] Savings
- [I] Idea
- [p] Pros
- [c] Cons
- [f] Fire
- [k] Key
- [w] Win
- [u] Up
- [d] Down
		`;

		const result = await markdownToTypst(markdown);

		// Verify cheq import
		expect(result).toContain('#import "@preview/cheq:0.3.0": checklist');
		expect(result).toContain('#show: checklist.with(extras: true)');

		// Verify all symbols are preserved
		const symbols = [
			' ', 'x', '/', '-',  // Basic
			'>', '<', '?', '!', '*', '"', 'l', 'b', 'i',  // Extras part 1
			'S', 'I', 'p', 'c', 'f', 'k', 'w', 'u', 'd'   // Extras part 2
		];

		symbols.forEach(symbol => {
			const pattern = `[${symbol}]`;
			expect(result).toContain(pattern);
		});
	});

	it("should handle ordered lists with checkboxes", async () => {
		const markdown = `
1. [x] First item
2. [ ] Second item
3. [/] Third item
		`;

		const result = await markdownToTypst(markdown);

		expect(result).toContain('[x] First item');
		expect(result).toContain('[ ] Second item');
		expect(result).toContain('[/] Third item');
	});
});

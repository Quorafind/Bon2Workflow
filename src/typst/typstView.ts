import { EditableFileView, TFile } from "obsidian";
import { EditorView } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { basicSetup } from "codemirror";

export const TYPST_VIEW_TYPE = "typst-view";

export class TypstView extends EditableFileView {
	private editor: EditorView | null = null;

	getViewType(): string {
		return TYPST_VIEW_TYPE;
	}

	getDisplayText(): string {
		return this.file?.basename || "Typst";
	}

	async onLoadFile(file: TFile): Promise<void> {
		const content = await this.app.vault.read(file);
		this.setViewData(content, false);
	}

	async onUnloadFile(file: TFile): Promise<void> {
		this.clear();
	}

	setViewData(data: string, clear: boolean): void {
		if (clear) {
			this.clear();
		}

		if (!this.editor) {
			this.createEditor(data);
		} else {
			this.updateContent(data);
		}
	}

	getViewData(): string {
		return this.editor?.state.doc.toString() || "";
	}

	clear(): void {
		if (this.editor) {
			this.editor.destroy();
			this.editor = null;
		}
		this.contentEl.empty();
	}

	private createEditor(content: string): void {
		const state = EditorState.create({
			doc: content,
			extensions: [basicSetup, EditorView.editable.of(true)],
		});

		this.editor = new EditorView({
			state,
			parent: this.contentEl,
		});
	}

	private updateContent(content: string): void {
		if (!this.editor) return;

		this.editor.dispatch({
			changes: {
				from: 0,
				to: this.editor.state.doc.length,
				insert: content,
			},
		});
	}
}

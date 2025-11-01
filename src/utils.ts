import { TypeDropdownComponent } from "./typeDropdown";

import {
	App,
	CachedMetadata,
	ListItemCache,
	MarkdownPostProcessorContext,
	TFile,
	TFolder,
	WorkspaceLeaf,
} from "obsidian";
import BonWorkflow from "./main";

export interface FolderTaskItem {
	name: string;
	status: string; // " " or "x" or something else like `!` based on the task status from `- [ ]`
}

export interface FileItem {
	file: TFile;
	selfEl: HTMLElement;
	innerEl: HTMLElement;
}

export async function handleTaskChanges(
	app: App,
	file: TFile,
	cache: CachedMetadata
) {
	if (file.path === "TODO.md") {
		// Change path as needed
		if (cache?.listItems) {
			const result = await extractFolderNames(app, cache.listItems, file);
			return result;
		}
	}
}

export function handleCallouts(
	element: HTMLElement,
	plugin: BonWorkflow,
	context: MarkdownPostProcessorContext
) {
	const callouts = element.findAll(".callout");

	for (const callout of callouts) {
		const iconEl = callout?.find(".callout-icon");

		if (iconEl) {
			const dropdown = new TypeDropdownComponent(
				iconEl,
				// @ts-ignore experimental API
				context.containerEl
			);
			dropdown.onload();
			plugin.addChild(dropdown);
		}
	}
}

export async function extractFolderNames(
	app: App,
	listItems: ListItemCache[],
	file: TFile
): Promise<FolderTaskItem[]> {
	const content = await app.vault.read(file);
	const lines = content.split("\n");
	return listItems
		.filter((item) => item.task !== undefined)
		.map((item) => {
			// Remove timestamp pattern from task text
			const text = lines[item.position.start.line] || "";
			return {
				name:
					text
						.replace(/^\s*?[-*\d.]*\s*\[[^\]]*\]\s*/, "")
						.replace(/\d{14}/g, "")
						.trim() || "",
				status: item.task || "", // Ensure status is never undefined
			};
		})
		.filter((item) => item.name.length > 0);
}

export async function updateFileExplorerCheckboxes(
	app: App,
	folderNames: FolderTaskItem[]
) {
	const fileExplorer = app.workspace.getLeavesOfType(
		"file-explorer"
	)[0] as WorkspaceLeaf & {
		view: {
			fileItems: Record<string, FileItem>;
		};
	};

	if (!fileExplorer?.view?.fileItems) return;

	const fileItems = fileExplorer.view.fileItems;

	document.querySelectorAll(".task-checkbox").forEach((el) => el.detach());

	Object.values(fileItems).forEach((fileItem) => {
		const itemName = fileItem.file.name;
		const matchingTask = folderNames.find(
			(task: FolderTaskItem) =>
				task.name === itemName.split("/").pop()?.split(".")[0]
		);

		if (matchingTask) {
			const checkbox = document.createElement("input");
			checkbox.type = "checkbox";
			checkbox.className = "task-checkbox";
			checkbox.checked = matchingTask.status != " ";
			checkbox.disabled = true;
			checkbox.dataset.task = matchingTask.status;

			// Insert checkbox before the file/folder name
			fileItem.selfEl.insertBefore(checkbox, fileItem.innerEl);
		}
	});
}

import type {
	EmbedDocumentNode,
	ObsidianBlockRefNode,
	ObsidianCalloutNode,
	ObsidianHighlightNode,
	ObsidianTagNode,
	ObsidianWikiLinkNode,
} from "../typst/transformer/types";

declare module "mdast" {
	interface RootContentMap {
		wikiLink: ObsidianWikiLinkNode;
		callout: ObsidianCalloutNode;
		obsidianTag: ObsidianTagNode;
		obsidianBlockRef: ObsidianBlockRefNode;
		obsidianHighlight: ObsidianHighlightNode;
		embedDocument: EmbedDocumentNode;
	}

	interface BlockContentMap {
		callout: ObsidianCalloutNode;
		embedDocument: EmbedDocumentNode;
	}

	interface PhrasingContentMap {
		wikiLink: ObsidianWikiLinkNode;
		obsidianTag: ObsidianTagNode;
		obsidianBlockRef: ObsidianBlockRefNode;
		obsidianHighlight: ObsidianHighlightNode;
	}
}

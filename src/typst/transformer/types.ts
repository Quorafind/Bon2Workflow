import type { App, Vault } from "obsidian";
import type { Parent, Literal, Node } from "unist";
import type { Content } from "mdast";

export interface TypstTransformOptions {
	enableWikiLinks: boolean;
	enableCallouts: boolean;
	enableTags: boolean;
	enableEmbeds: boolean;
	enableBlockRefs: boolean;
	enableHighlights: boolean;
	enableComments: boolean;
	enableMath: boolean;
	h1Level: number;
	labelPrefix: string;
	preserveFrontmatter: boolean;
	maxEmbedDepth: number;
	/**
	 * Enable enhanced checkbox support with cheq package
	 * When true: Generates #import for @preview/cheq (requires CLI compilation)
	 * When false: Uses basic GFM checkboxes only (WASM compatible)
	 * @default true
	 */
	enableCheckboxEnhancement: boolean;
	onEmbedDepthExceeded?: (path: string, depth: number) => void;
	onCircularReference?: (path: string, stack: string[]) => void;
	onMissingEmbed?: (path: string) => void;
}

export interface GeneratorContext {
	options: TypstTransformOptions;
	currentDepth: number;
	inCodeBlock: boolean;
	inListItem: boolean; // 标识当前是否在列表项内部（用于控制段落 parbreak 行为）
	listDepth: number; // 列表嵌套深度（用于计算嵌套列表的缩进）
	collectedLabels: Set<string>;
	currentFile: string; // 当前正在转换的文件路径（用于计算相对路径）
}

export interface EmbedResolveResult {
	path: string;
	extension: string;
	isMarkdown: boolean;
}

export type ResolveFilePath = (
	link: string,
	currentFile: string
) => Promise<EmbedResolveResult | null>;

export interface EmbedContext {
	vault: Vault;
	currentFile: string;
	currentDepth: number;
	maxDepth: number;
	embedStack: string[];
	resolveFilePath: ResolveFilePath;
}

export interface EmbedEnvironment {
	app: App;
	vault: Vault;
	currentFile: string;
	resolveFilePath?: ResolveFilePath;
}

export interface ObsidianWikiLinkNode extends Literal {
	type: "wikiLink";
	value: string;
	alias?: string;
	path?: string;
	heading?: string;
}

export interface ObsidianCalloutNode extends Parent {
	type: "callout";
	calloutType: string;
	title?: string;
	children: Content[];
}

export interface ObsidianTagNode extends Literal {
	type: "obsidianTag";
	value: string;
}

export interface ObsidianBlockRefNode extends Literal {
	type: "obsidianBlockRef";
	value: string;
}

export interface ObsidianHighlightNode extends Parent {
	type: "obsidianHighlight";
	children: Content[];
}

export interface ObsidianCommentNode extends Literal {
	type: "obsidianComment";
	value: string;
}

export interface EmbedDocumentNode extends Parent {
	type: "embedDocument";
	data: {
		originalPath: string;
		assetPath?: string;
		depth: number;
		alias?: string;
		heading?: string;
		parameters?: string;
		rawTarget?: string;
		assetKind?: "markdown" | "image" | "pdf" | "binary";
		imageOptions?: EmbedImageOptions;
		convertedTypst?: string; // 已转换的 Typst 内容
	};
	children: Content[];
}

export interface EmbedImageOptions {
	width?: string;
	height?: string;
	page?: number;
}

export interface InlineMathNode extends Literal {
	type: "inlineMath";
	value: string;
}

export interface MathNode extends Literal {
	type: "math";
	value: string;
}

export type ObsidianNode =
	| ObsidianWikiLinkNode
	| ObsidianCalloutNode
	| ObsidianTagNode
	| ObsidianBlockRefNode
	| ObsidianHighlightNode
	| ObsidianCommentNode
	| EmbedDocumentNode;

export type TypstAstNode = Content | ObsidianNode;

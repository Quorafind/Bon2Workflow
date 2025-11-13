import { normalizePath, type Vault } from "obsidian";
import { unified } from "unified";
import type { Processor } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkFrontmatter from "remark-frontmatter";
import { visit } from "unist-util-visit";
import type { Content, Root } from "mdast";
import { TypstGenerator } from "./generator";
import * as plugins from "./plugins";
import type {
	EmbedDocumentNode,
	EmbedEnvironment,
	EmbedImageOptions,
	EmbedResolveResult,
	ResolveFilePath,
	TypstTransformOptions,
} from "./types";

const DEFAULT_OPTIONS: TypstTransformOptions = {
	enableWikiLinks: true,
	enableCallouts: true,
	enableTags: true,
	enableEmbeds: true,
	enableBlockRefs: true,
	enableHighlights: true,
	enableComments: true,
	enableMath: true,
	h1Level: 1,
	labelPrefix: "",
	preserveFrontmatter: false,
	maxEmbedDepth: 5,
	enableCheckboxEnhancement: true,
};

const IMAGE_EXTENSIONS = new Set([
	"png",
	"jpg",
	"jpeg",
	"gif",
	"bmp",
	"svg",
	"webp",
	"avif",
]);

function toTypstLength(value: string): string {
	return /^\d+(\.\d+)?$/.test(value) ? `${value}pt` : value;
}

function parseImageOptions(raw?: string): EmbedImageOptions | undefined {
	if (!raw || !raw.trim()) {
		return undefined;
	}

	const options: EmbedImageOptions = {};
	const trimmed = raw.trim();

	if (/^\d+(\.\d+)?([a-zA-Z%]+)?$/.test(trimmed)) {
		options.width = toTypstLength(trimmed);
		return options;
	}

	for (const chunk of trimmed.split(",")) {
		const [keyRaw, valueRaw] = chunk.split("=");
		const key = keyRaw?.trim().toLowerCase();
		const value = valueRaw?.trim();
		if (!key || !value) {
			continue;
		}
		if (key === "width" || key === "height") {
			options[key] = toTypstLength(value);
		} else if (key === "page") {
			const page = Number(value);
			if (!Number.isNaN(page)) {
				options.page = page;
			}
		}
	}

	return Object.keys(options).length ? options : undefined;
}

function createProcessor(options: TypstTransformOptions) {
	const processor = unified() as Processor<any>;
	processor.use(remarkParse).use(remarkGfm).use(remarkFrontmatter, ["yaml"]);

	if (options.enableMath) {
		processor.use(remarkMath);
	}

	if (options.enableEmbeds) {
		processor.use(plugins.remarkEmbeds);
	}

	if (options.enableComments) {
		processor.use(plugins.remarkComments);
	}

	if (options.enableWikiLinks) {
		processor.use(plugins.remarkWikiLinks);
	}

	if (options.enableCallouts) {
		processor.use(plugins.remarkCallouts);
	}

	if (options.enableTags) {
		processor.use(plugins.remarkTags);
	}

	if (options.enableHighlights) {
		processor.use(plugins.remarkHighlights);
	}

	if (options.enableBlockRefs) {
		processor.use(plugins.remarkBlockRefs);
	}

	return processor as Processor<Root>;
}

async function fallbackResolveFilePath(
	link: string,
	env: EmbedEnvironment
): Promise<EmbedResolveResult | null> {
	// 使用 Obsidian 原生 API 解析链接
	const file = env.app.metadataCache.getFirstLinkpathDest(link, env.currentFile);

	if (!file) {
		return null;
	}

	return {
		path: file.path,
		extension: file.extension,
		isMarkdown: file.extension.toLowerCase() === "md",
	};
}

async function resolveEmbedNode(
	node: EmbedDocumentNode,
	options: TypstTransformOptions,
	env: EmbedEnvironment,
	depth: number,
	stack: string[]
): Promise<void> {
	const linkTarget =
		node.data?.originalPath ??
		node.data?.rawTarget ??
		node.data?.alias ??
		"";
	if (!linkTarget) {
		return;
	}

	const resolver =
		env.resolveFilePath ??
		(async (link: string) => fallbackResolveFilePath(link, env));
	const resolved = await resolver(linkTarget, env.currentFile);

	if (!resolved) {
		options.onMissingEmbed?.(linkTarget);
		return;
	}

	if (depth >= options.maxEmbedDepth) {
		options.onEmbedDepthExceeded?.(resolved.path, depth);
		return;
	}

	if (stack.includes(resolved.path)) {
		options.onCircularReference?.(resolved.path, stack);
		return;
	}

	const imageOptions = parseImageOptions(node.data?.parameters);

	node.data = {
		...(node.data ?? { originalPath: resolved.path, depth }),
		originalPath: resolved.path,
		assetPath: resolved.path,
		imageOptions,
		depth: depth + 1,
	};

	const extension = resolved.extension.toLowerCase();

	if (!resolved.isMarkdown) {
		if (extension === "pdf") {
			node.data.assetKind = "pdf";
		} else if (IMAGE_EXTENSIONS.has(extension)) {
			node.data.assetKind = "image";
		} else {
			node.data.assetKind = "binary";
		}
		node.children = [];
		return;
	}

	node.data.assetKind = "markdown";

	const adapter = env.vault.adapter;
	const content = await adapter.read(resolved.path);

	// 创建新的环境
	const nextEnv: EmbedEnvironment = {
		...env,
		currentFile: resolved.path,
	};

	// 1. 解析嵌入文件的 Markdown 为 AST
	const processor = createProcessor(options);
	const parsed = processor.parse(content) as Root;
	const transformed = (await processor.run(parsed)) as Root;

	// 2. 递归解析嵌入的嵌入（保持深度和栈的连续性）
	await resolveEmbedsInTree(
		transformed,
		options,
		nextEnv,
		depth + 1,
		stack.concat(resolved.path)
	);

	// 3. 生成 Typst 代码（传入当前文件路径用于计算相对路径）
	const generator = new TypstGenerator(options, resolved.path);
	const convertedTypst = generator.generate(transformed);

	// 4. 存储转换后的 Typst 内容
	node.data.convertedTypst = convertedTypst;

	// 5. 清空 children（不再需要 AST 节点）
	node.children = [];
}

async function resolveEmbedsInTree(
	root: Root,
	options: TypstTransformOptions,
	env: EmbedEnvironment,
	depth = 0,
	stack: string[] = []
): Promise<void> {
	if (!options.enableEmbeds) {
		return;
	}

	const embedNodes: EmbedDocumentNode[] = [];
	visit(root, "embedDocument", (node) => {
		embedNodes.push(node as EmbedDocumentNode);
	});

	for (const embedNode of embedNodes) {
		await resolveEmbedNode(embedNode, options, env, depth, stack);
	}
}

export async function markdownToTypst(
	markdown: string,
	options: Partial<TypstTransformOptions> = {},
	embedEnvironment?: EmbedEnvironment
): Promise<string> {
	const fullOptions: TypstTransformOptions = {
		...DEFAULT_OPTIONS,
		...options,
	};

	const processor = createProcessor(fullOptions);
	const parsed = processor.parse(markdown) as Root;
	const transformed = (await processor.run(parsed)) as Root;

	if (embedEnvironment && fullOptions.enableEmbeds) {
		await resolveEmbedsInTree(transformed, fullOptions, embedEnvironment, 0, [
			embedEnvironment.currentFile,
		]);
	}

	// 传入当前文件路径（用于计算图片等资源的相对路径）
	const currentFile = embedEnvironment?.currentFile || "";
	const generator = new TypstGenerator(fullOptions, currentFile);
	return generator.generate(transformed);
}

export { TypstGenerator };
export type { TypstTransformOptions, EmbedEnvironment };

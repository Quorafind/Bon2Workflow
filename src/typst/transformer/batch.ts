import { dirname, join } from "path";
import { mkdir, readFile, writeFile } from "fs/promises";
import { markdownToTypst } from "./index";
import type { TypstTransformOptions, EmbedEnvironment } from "./types";

export interface BatchConvertOptions {
	concurrency?: number;
	transformOptions?: Partial<TypstTransformOptions>;
	createEmbedEnvironment?: (file: string) => Promise<EmbedEnvironment | undefined>;
	outputResolver?: (inputFile: string, outputDir: string) => string;
	readFile?: (file: string) => Promise<string>;
	writeFile?: (file: string, content: string) => Promise<void>;
}

export interface BatchConvertResult {
	success: string[];
	failed: { file: string; error: string }[];
}

function defaultOutputResolver(inputFile: string, outputDir: string): string {
	const basename = inputFile.replace(/\\/g, "/").split("/").pop() ?? "output";
	const withoutExt = basename.replace(/\.[^.]+$/, "");
	return join(outputDir, `${withoutExt}.typ`);
}

async function ensureDir(filePath: string): Promise<void> {
	await mkdir(dirname(filePath), { recursive: true });
}

export async function batchConvert(
	inputFiles: string[],
	outputDir: string,
	options: BatchConvertOptions = {}
): Promise<BatchConvertResult> {
	const concurrency = Math.max(1, options.concurrency ?? 4);
	const read = options.readFile ?? (async (file: string) => readFile(file, "utf-8"));
	const write =
		options.writeFile ??
		(async (file: string, content: string) => {
			await ensureDir(file);
			await writeFile(file, content, "utf-8");
		});
	const resolveOutput = options.outputResolver ?? defaultOutputResolver;

	const queue = inputFiles.slice();
	const success: string[] = [];
	const failed: { file: string; error: string }[] = [];

	async function worker(): Promise<void> {
		while (queue.length) {
			const file = queue.shift();
			if (!file) {
				return;
			}
			try {
				const markdown = await read(file);
				const embedEnv = options.createEmbedEnvironment
					? await options.createEmbedEnvironment(file)
					: undefined;
				const typstContent = await markdownToTypst(
					markdown,
					options.transformOptions,
					embedEnv
				);
				const outputPath = resolveOutput(file, outputDir);
				await write(outputPath, typstContent);
				success.push(file);
			} catch (error) {
				const message =
					error instanceof Error ? error.message : String(error);
				failed.push({ file, error: message });
			}
		}
	}

	const workers = Array.from({ length: concurrency }, () => worker());
	await Promise.all(workers);

	return { success, failed };
}

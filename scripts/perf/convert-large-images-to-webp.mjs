#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import sharp from "sharp";

const DEFAULT_MIN_BYTES = 200 * 1024;
const DEFAULT_QUALITY = 82;
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png"]);
const CONTENT_EXTENSIONS = new Set([".md", ".mdx", ".html", ".astro"]);

function printHelp() {
	console.log(`Usage:
  node scripts/perf/convert-large-images-to-webp.mjs [options]

Options:
  --assets-dir <dir>     Directory to scan for large images. Default: public/images
  --content-dir <dir>    Content directory to rewrite when --rewrite is enabled. Can be used multiple times.
  --min-bytes <number>   Minimum file size to convert. Default: ${DEFAULT_MIN_BYTES}
  --quality <number>     WebP quality (1-100). Default: ${DEFAULT_QUALITY}
  --rewrite              Rewrite matching image references in content files.
  --dry-run              Show what would change without writing files.
  --help                 Show this help message.
`);
}

function parseArgs(argv) {
	const options = {
		assetsDir: "public/images",
		contentDirs: [],
		minBytes: DEFAULT_MIN_BYTES,
		quality: DEFAULT_QUALITY,
		rewrite: false,
		dryRun: false,
	};

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === "--assets-dir") {
			options.assetsDir = argv[index + 1];
			index += 1;
			continue;
		}
		if (arg === "--content-dir") {
			options.contentDirs.push(argv[index + 1]);
			index += 1;
			continue;
		}
		if (arg === "--min-bytes") {
			options.minBytes = Number(argv[index + 1] || DEFAULT_MIN_BYTES);
			index += 1;
			continue;
		}
		if (arg === "--quality") {
			options.quality = Number(argv[index + 1] || DEFAULT_QUALITY);
			index += 1;
			continue;
		}
		if (arg === "--rewrite") {
			options.rewrite = true;
			continue;
		}
		if (arg === "--dry-run") {
			options.dryRun = true;
			continue;
		}
		if (arg === "--help" || arg === "-h") {
			printHelp();
			process.exit(0);
		}
		throw new Error(`Unknown argument: ${arg}`);
	}

	if (!Number.isFinite(options.minBytes) || options.minBytes <= 0) {
		throw new Error("--min-bytes must be a positive number");
	}
	if (!Number.isFinite(options.quality) || options.quality < 1 || options.quality > 100) {
		throw new Error("--quality must be between 1 and 100");
	}
	if (options.rewrite && options.contentDirs.length === 0) {
		options.contentDirs.push("src/content");
	}

	return options;
}

async function walkFiles(rootDir, predicate) {
	const entries = await fs.readdir(rootDir, { withFileTypes: true });
	const files = [];

	for (const entry of entries) {
		const fullPath = path.join(rootDir, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await walkFiles(fullPath, predicate)));
			continue;
		}
		if (predicate(fullPath)) {
			files.push(fullPath);
		}
	}

	return files;
}

async function pathExists(targetPath) {
	try {
		await fs.access(targetPath);
		return true;
	} catch {
		return false;
	}
}

function toWebPath(absolutePath, publicRoot) {
	const relativePath = path.relative(publicRoot, absolutePath).split(path.sep).join("/");
	return `/${relativePath}`;
}

async function convertImage(sourcePath, targetPath, quality, dryRun) {
	if (dryRun) {
		return;
	}

	await sharp(sourcePath)
		.webp({
			quality,
			smartSubsample: true,
		})
		.toFile(targetPath);
}

function buildReplacementVariants(fromPath, toPath) {
	const rawFrom = fromPath;
	const rawTo = toPath;
	const encodedFrom = fromPath.replace(/ /g, "%20");
	const encodedTo = toPath.replace(/ /g, "%20");
	const escapedFrom = fromPath.replace(/ /g, "\\ ");
	const escapedTo = toPath.replace(/ /g, "\\ ");

	return [
		[rawFrom, rawTo],
		[encodedFrom, encodedTo],
		[escapedFrom, escapedTo],
	];
}

async function rewriteReferences(contentDirs, replacements, dryRun) {
	let changedFiles = 0;
	let totalReplacements = 0;

	for (const contentDir of contentDirs) {
		const absoluteDir = path.resolve(contentDir);
		if (!(await pathExists(absoluteDir))) {
			continue;
		}

		const contentFiles = await walkFiles(
			absoluteDir,
			(filePath) => CONTENT_EXTENSIONS.has(path.extname(filePath).toLowerCase()),
		);

		for (const filePath of contentFiles) {
			const original = await fs.readFile(filePath, "utf8");
			let next = original;

			for (const [fromPath, toPath] of replacements) {
				for (const [fromVariant, toVariant] of buildReplacementVariants(fromPath, toPath)) {
					if (!fromVariant || fromVariant === toVariant) {
						continue;
					}
					if (next.includes(fromVariant)) {
						next = next.split(fromVariant).join(toVariant);
					}
				}
			}

			if (next === original) {
				continue;
			}

			changedFiles += 1;
			totalReplacements += 1;
			if (!dryRun) {
				await fs.writeFile(filePath, next, "utf8");
			}
			console.log(`[rewrite] ${path.relative(process.cwd(), filePath)}`);
		}
	}

	return { changedFiles, totalReplacements };
}

async function main() {
	const options = parseArgs(process.argv.slice(2));
	const assetsDir = path.resolve(options.assetsDir);
	const publicRoot = path.resolve("public");
	const files = await walkFiles(
		assetsDir,
		(filePath) => IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase()),
	);

	const replacements = [];
	let convertedCount = 0;
	let skippedCount = 0;
	let savedBytes = 0;

	for (const sourcePath of files) {
		const stats = await fs.stat(sourcePath);
		if (stats.size < options.minBytes) {
			skippedCount += 1;
			continue;
		}

		const targetPath = sourcePath.replace(/\.(png|jpe?g)$/i, ".webp");
		const targetExists = await pathExists(targetPath);

		if (targetExists) {
			const targetStats = await fs.stat(targetPath);
			if (targetStats.mtimeMs >= stats.mtimeMs) {
				skippedCount += 1;
				replacements.push([
					toWebPath(sourcePath, publicRoot),
					toWebPath(targetPath, publicRoot),
				]);
				continue;
			}
		}

		await convertImage(sourcePath, targetPath, options.quality, options.dryRun);

		let targetBytes = 0;
		if (!options.dryRun) {
			targetBytes = (await fs.stat(targetPath)).size;
		}

		convertedCount += 1;
		savedBytes += Math.max(stats.size - targetBytes, 0);
		replacements.push([
			toWebPath(sourcePath, publicRoot),
			toWebPath(targetPath, publicRoot),
		]);

		const outputSize = options.dryRun ? "dry-run" : `${Math.round(targetBytes / 1024)}KB`;
		console.log(
			`[convert] ${path.relative(process.cwd(), sourcePath)} -> ${path.relative(process.cwd(), targetPath)} (${Math.round(stats.size / 1024)}KB -> ${outputSize})`,
		);
	}

	let rewriteResult = { changedFiles: 0, totalReplacements: 0 };
	if (options.rewrite && replacements.length > 0) {
		rewriteResult = await rewriteReferences(options.contentDirs, replacements, options.dryRun);
	}

	console.log("");
	console.log(`Converted: ${convertedCount}`);
	console.log(`Skipped: ${skippedCount}`);
	console.log(`Estimated saved bytes: ${savedBytes}`);
	if (options.rewrite) {
		console.log(`Rewritten files: ${rewriteResult.changedFiles}`);
	}
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
});

import fs from "node:fs/promises";
import path from "node:path";

const cacheFiles = [
	".astro/data-store.json",
	".astro/content-assets.mjs",
	".astro/content-modules.mjs",
	"node_modules/.astro/data-store.json",
	"node_modules/.astro/content-assets.mjs",
	"node_modules/.astro/content-modules.mjs",
];

async function removeIfExists(target) {
	const filePath = path.resolve(process.cwd(), target);
	try {
		await fs.rm(filePath, { force: true });
		console.log(`[cache] cleared ${target}`);
	} catch (error) {
		console.warn(`[cache] failed to clear ${target}:`, error);
	}
}

await Promise.all(cacheFiles.map((target) => removeIfExists(target)));

import path from "node:path";

const DEFAULT_DATA_DIR = path.join(process.cwd(), ".runtime");

export function getRuntimeDataDir() {
	if (process.env.NODE_ENV === "production" && !process.env.BLOG_DATA_DIR) {
		throw new Error(
			"BLOG_DATA_DIR is required in production for persistent comments and stats.",
		);
	}

	return path.resolve(process.env.BLOG_DATA_DIR || DEFAULT_DATA_DIR);
}

import fs from "node:fs/promises";
import path from "node:path";
import { getCollection } from "astro:content";
import { glob } from "glob";

import { getPostUrl } from "@/utils/url-utils";

type KnowledgeEntry = {
	id: string;
	kind: "post" | "doc" | "code";
	title: string;
	path: string;
	url?: string;
	text: string;
};

const ROOT = process.cwd();
const EXTRA_SOURCE_PATTERNS = [
	"docs/**/*.md",
	"src/pages/api/**/*.ts",
	"src/utils/**/*.{ts,js,mjs}",
	"src/layouts/**/*.astro",
	"src/config.ts",
];

function normalizeWhitespace(value: string) {
	return value
		.replace(/\r\n/g, "\n")
		.replace(/\u00a0/g, " ")
		.replace(/[ \t]+\n/g, "\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

function stripMarkdown(source: string) {
	return normalizeWhitespace(
		source
			.replace(/```[\s\S]*?```/g, "\n")
			.replace(/`([^`]+)`/g, "$1")
			.replace(/!\[[^\]]*]\(([^)]+)\)/g, "$1")
			.replace(/\[([^\]]+)]\(([^)]+)\)/g, "$1")
			.replace(/^#{1,6}\s+/gm, "")
			.replace(/^>\s?/gm, "")
			.replace(/^[-*+]\s+/gm, "")
			.replace(/^\d+\.\s+/gm, "")
			.replace(/[*_~]/g, ""),
	);
}

function trimText(source: string, maxLength = 14000) {
	if (source.length <= maxLength) {
		return source;
	}
	return `${source.slice(0, maxLength)}\n…`;
}

async function buildPostEntries() {
	const posts = await getCollection("posts", ({ data }) => data.draft !== true);
	return posts.map<KnowledgeEntry>((post) => ({
		id: `post:${post.id}`,
		kind: "post",
		title: post.data.title,
		path: `src/content/posts/${post.id}.md`,
		url: getPostUrl(post),
		text: trimText(
			normalizeWhitespace(
				[
					post.data.title,
					post.data.description || "",
					post.data.category || "",
					...(post.data.tags || []),
					stripMarkdown(String(post.body || "")),
				]
					.filter(Boolean)
					.join("\n\n"),
			),
		),
	}));
}

async function buildExtraEntries() {
	const matchedFiles = await glob(EXTRA_SOURCE_PATTERNS, {
		cwd: ROOT,
		nodir: true,
		ignore: ["**/node_modules/**", "**/.astro/**", "**/dist/**"],
	});

	const entries = await Promise.all(
		matchedFiles.map(async (relativePath) => {
			const absolutePath = path.join(ROOT, relativePath);
			const raw = await fs.readFile(absolutePath, "utf8");
			const isMarkdown = relativePath.endsWith(".md");
			const title =
				isMarkdown &&
				raw.match(/^#\s+(.+)$/m)?.[1]?.trim()
					? raw.match(/^#\s+(.+)$/m)?.[1]?.trim() || relativePath
					: relativePath;

			return {
				id: `${isMarkdown ? "doc" : "code"}:${relativePath}`,
				kind: isMarkdown ? "doc" : "code",
				title,
				path: relativePath,
				text: trimText(
					isMarkdown ? stripMarkdown(raw) : normalizeWhitespace(raw),
					isMarkdown ? 12000 : 9000,
				),
			} satisfies KnowledgeEntry;
		}),
	);

	return entries;
}

export async function GET() {
	const [postEntries, extraEntries] = await Promise.all([
		buildPostEntries(),
		buildExtraEntries(),
	]);

	const payload = {
		generatedAt: new Date().toISOString(),
		entries: [...postEntries, ...extraEntries],
	};

	return new Response(JSON.stringify(payload), {
		headers: {
			"Content-Type": "application/json; charset=utf-8",
			"Cache-Control": "public, max-age=3600",
		},
	});
}

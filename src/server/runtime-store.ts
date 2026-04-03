import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

type StatsEntry = {
	pageviews: number;
	visitorIds: string[];
	updatedAt: string;
};

type StatsData = {
	site: StatsEntry;
	pages: Record<string, StatsEntry>;
};

type StoredComment = {
	id: string;
	path: string;
	author: string;
	content: string;
	website?: string;
	visitorId: string;
	createdAt: string;
};

type CommentsData = {
	items: StoredComment[];
};

export type PublicComment = Omit<StoredComment, "visitorId">;

export type StatsSnapshot = {
	page: {
		path: string;
		pageviews: number;
		visits: number;
	};
	site: {
		pageviews: number;
		visits: number;
	};
};

const DATA_DIR = path.resolve(
	process.env.BLOG_DATA_DIR || path.join(process.cwd(), ".runtime"),
);
const STATS_FILE = path.join(DATA_DIR, "stats.json");
const COMMENTS_FILE = path.join(DATA_DIR, "comments.json");
const COMMENT_THROTTLE_MS = 45_000;
const COMMENT_DAILY_LIMIT = 8;

let writeQueue: Promise<unknown> = Promise.resolve();

function createEmptyStats(): StatsData {
	return {
		site: {
			pageviews: 0,
			visitorIds: [],
			updatedAt: "",
		},
		pages: {},
	};
}

function createEmptyComments(): CommentsData {
	return {
		items: [],
	};
}

async function ensureDataDir() {
	await mkdir(DATA_DIR, { recursive: true });
}

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
	await ensureDataDir();
	try {
		const content = await readFile(filePath, "utf8");
		if (!content.trim()) {
			return fallback;
		}
		return JSON.parse(content) as T;
	} catch (error) {
		if (
			typeof error === "object" &&
			error !== null &&
			"code" in error &&
			error.code === "ENOENT"
		) {
			return fallback;
		}
		throw error;
	}
}

async function writeJsonFile(filePath: string, payload: unknown) {
	await ensureDataDir();
	const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
	await writeFile(tempPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
	await rename(tempPath, filePath);
}

function withWriteLock<T>(job: () => Promise<T>) {
	const nextJob = writeQueue.then(job, job);
	writeQueue = nextJob.then(
		() => undefined,
		() => undefined,
	);
	return nextJob;
}

function toPublicComment(comment: StoredComment): PublicComment {
	const { visitorId: _visitorId, ...publicComment } = comment;
	return publicComment;
}

function toStatsSnapshot(stats: StatsData, pathKey: string): StatsSnapshot {
	const normalizedPath = normalizePathKey(pathKey);
	const pageEntry = stats.pages[normalizedPath] || {
		pageviews: 0,
		visitorIds: [],
		updatedAt: "",
	};

	return {
		page: {
			path: normalizedPath,
			pageviews: pageEntry.pageviews,
			visits: pageEntry.visitorIds.length,
		},
		site: {
			pageviews: stats.site.pageviews,
			visits: stats.site.visitorIds.length,
		},
	};
}

function normalizeUrlPath(input: string) {
	try {
		if (/^https?:\/\//i.test(input)) {
			return new URL(input).pathname;
		}
	} catch {
		return input;
	}
	return input;
}

export function normalizePathKey(input: string) {
	const rawPath = normalizeUrlPath(String(input || "").trim()) || "/";
	const pathWithoutQuery = rawPath.split("?")[0]?.split("#")[0] || "/";
	let normalized = pathWithoutQuery.startsWith("/")
		? pathWithoutQuery
		: `/${pathWithoutQuery}`;

	normalized = normalized.replace(/\/{2,}/g, "/");

	if (!/\.[a-z0-9]+$/i.test(normalized) && !normalized.endsWith("/")) {
		normalized = `${normalized}/`;
	}

	return normalized || "/";
}

export function sanitizeVisitorId(input?: string) {
	const value = String(input || "").trim();
	if (/^[a-zA-Z0-9_-]{8,80}$/.test(value)) {
		return value;
	}
	return randomUUID().replace(/-/g, "");
}

async function readStatsData() {
	return readJsonFile<StatsData>(STATS_FILE, createEmptyStats());
}

async function writeStatsData(stats: StatsData) {
	await writeJsonFile(STATS_FILE, stats);
}

async function readCommentsData() {
	return readJsonFile<CommentsData>(COMMENTS_FILE, createEmptyComments());
}

async function writeCommentsData(comments: CommentsData) {
	await writeJsonFile(COMMENTS_FILE, comments);
}

export async function getStatsSnapshot(pathKey: string) {
	const stats = await readStatsData();
	return toStatsSnapshot(stats, pathKey);
}

export async function recordPageView(pathKey: string, visitorId: string) {
	return withWriteLock(async () => {
		const normalizedPath = normalizePathKey(pathKey);
		const normalizedVisitorId = sanitizeVisitorId(visitorId);
		const now = new Date().toISOString();
		const stats = await readStatsData();
		const pageEntry = stats.pages[normalizedPath] || {
			pageviews: 0,
			visitorIds: [],
			updatedAt: now,
		};

		const siteVisitors = new Set(stats.site.visitorIds);
		const pageVisitors = new Set(pageEntry.visitorIds);

		stats.site.pageviews += 1;
		stats.site.updatedAt = now;
		siteVisitors.add(normalizedVisitorId);
		stats.site.visitorIds = Array.from(siteVisitors);

		pageEntry.pageviews += 1;
		pageEntry.updatedAt = now;
		pageVisitors.add(normalizedVisitorId);
		pageEntry.visitorIds = Array.from(pageVisitors);
		stats.pages[normalizedPath] = pageEntry;

		await writeStatsData(stats);
		return toStatsSnapshot(stats, normalizedPath);
	});
}

export async function listComments(pathKey: string) {
	const normalizedPath = normalizePathKey(pathKey);
	const comments = await readCommentsData();
	return comments.items
		.filter((comment) => comment.path === normalizedPath)
		.sort(
			(a, b) =>
				new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
		)
		.map(toPublicComment);
}

export async function createComment(input: {
	path: string;
	author: string;
	content: string;
	website?: string;
	visitorId?: string;
}) {
	return withWriteLock(async () => {
		const normalizedPath = normalizePathKey(input.path);
		const normalizedVisitorId = sanitizeVisitorId(input.visitorId);
		const comments = await readCommentsData();
		const now = Date.now();

		const sameVisitorComments = comments.items.filter(
			(comment) =>
				comment.path === normalizedPath &&
				comment.visitorId === normalizedVisitorId,
		);

		const recentComment = sameVisitorComments.find((comment) => {
			const createdAt = new Date(comment.createdAt).getTime();
			return now - createdAt < COMMENT_THROTTLE_MS;
		});

		if (recentComment) {
			const error = new Error("Please wait a moment before posting again.");
			(error as Error & { code?: string }).code = "COMMENT_RATE_LIMIT";
			throw error;
		}

		const dailyCount = sameVisitorComments.filter((comment) => {
			const createdAt = new Date(comment.createdAt).getTime();
			return now - createdAt < 24 * 60 * 60 * 1000;
		}).length;

		if (dailyCount >= COMMENT_DAILY_LIMIT) {
			const error = new Error("Daily comment limit reached for this visitor.");
			(error as Error & { code?: string }).code = "COMMENT_DAILY_LIMIT";
			throw error;
		}

		const nextComment: StoredComment = {
			id: randomUUID(),
			path: normalizedPath,
			author: input.author,
			content: input.content,
			website: input.website,
			visitorId: normalizedVisitorId,
			createdAt: new Date(now).toISOString(),
		};

		comments.items.push(nextComment);
		await writeCommentsData(comments);

		return {
			comment: toPublicComment(nextComment),
			items: comments.items
				.filter((comment) => comment.path === normalizedPath)
				.sort(
					(a, b) =>
						new Date(b.createdAt).getTime() -
						new Date(a.createdAt).getTime(),
				)
				.map(toPublicComment),
		};
	});
}

import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

type StatsEntry = {
	pageviews: number;
	visitorSketch: number[];
	updatedAt: string;
};

type StatsData = {
	site: StatsEntry;
	pages: Record<string, StatsEntry>;
};

type LegacyStatsEntry = Partial<StatsEntry> & {
	visitorIds?: string[];
};

type LegacyStatsData = Partial<StatsData> & {
	site?: LegacyStatsEntry;
	pages?: Record<string, LegacyStatsEntry>;
};

type StoredComment = {
	id: string;
	path: string;
	author: string;
	content: string;
	contact?: string;
	website?: string;
	visitorId: string;
	createdAt: string;
};

type CommentsData = {
	items: StoredComment[];
};

export type PublicComment = {
	id: string;
	path: string;
	author: string;
	content: string;
	contact?: string;
	createdAt: string;
};

export type StatsSnapshot = {
	page: {
		path: string;
		pageviews: number;
		visits: number;
		visitors: number;
	};
	site: {
		pageviews: number;
		visits: number;
		visitors: number;
	};
};

const HLL_PRECISION = 7;
const HLL_REGISTERS = 1 << HLL_PRECISION;
const COMMENT_THROTTLE_MS = 45_000;
const COMMENT_DAILY_LIMIT = 8;
const LOCK_STALE_MS = 30_000;
const LOCK_RETRY_MS = 80;
const DEFAULT_DATA_DIR = path.join(process.cwd(), ".runtime");

const DATA_DIR = path.resolve(process.env.BLOG_DATA_DIR || DEFAULT_DATA_DIR);
const STATS_FILE = path.join(DATA_DIR, "stats.json");
const COMMENTS_FILE = path.join(DATA_DIR, "comments.json");

let writeQueue: Promise<unknown> = Promise.resolve();
let didWarnAboutDefaultDataDir = false;

function createEmptySketch() {
	return Array.from({ length: HLL_REGISTERS }, () => 0);
}

function createEmptyStatsEntry(updatedAt = ""): StatsEntry {
	return {
		pageviews: 0,
		visitorSketch: createEmptySketch(),
		updatedAt,
	};
}

function createEmptyStats(): StatsData {
	return {
		site: createEmptyStatsEntry(),
		pages: {},
	};
}

function createEmptyComments(): CommentsData {
	return {
		items: [],
	};
}

function maybeWarnAboutDefaultDataDir() {
	if (didWarnAboutDefaultDataDir || process.env.BLOG_DATA_DIR) {
		return;
	}

	didWarnAboutDefaultDataDir = true;
	console.warn(
		`[owen-blog] BLOG_DATA_DIR is not set. Runtime data is being written to ${DATA_DIR}. Set BLOG_DATA_DIR to a persistent path before production deploys.`,
	);
}

async function ensureDataDir() {
	maybeWarnAboutDefaultDataDir();
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

function withProcessWriteLock<T>(job: () => Promise<T>) {
	const nextJob = writeQueue.then(job, job);
	writeQueue = nextJob.then(
		() => undefined,
		() => undefined,
	);
	return nextJob;
}

function sleep(ms: number) {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

async function acquireFileLock(lockName: string) {
	await ensureDataDir();
	const lockPath = path.join(DATA_DIR, `${lockName}.lock`);

	for (;;) {
		try {
			await mkdir(lockPath);
			return lockPath;
		} catch (error) {
			if (
				typeof error !== "object" ||
				error === null ||
				!("code" in error) ||
				error.code !== "EEXIST"
			) {
				throw error;
			}

			try {
				const info = await stat(lockPath);
				if (Date.now() - info.mtimeMs > LOCK_STALE_MS) {
					await rm(lockPath, { recursive: true, force: true });
					continue;
				}
			} catch (statError) {
				if (
					typeof statError === "object" &&
					statError !== null &&
					"code" in statError &&
					statError.code === "ENOENT"
				) {
					continue;
				}
				throw statError;
			}

			await sleep(LOCK_RETRY_MS + Math.floor(Math.random() * 40));
		}
	}
}

async function withFileLock<T>(lockName: string, job: () => Promise<T>) {
	const lockPath = await acquireFileLock(lockName);
	try {
		return await job();
	} finally {
		await rm(lockPath, { recursive: true, force: true });
	}
}

function normalizeSketch(input: unknown) {
	if (!Array.isArray(input) || input.length !== HLL_REGISTERS) {
		return createEmptySketch();
	}

	return input.map((value) => {
		const numeric = Number(value);
		if (!Number.isFinite(numeric) || numeric < 0) {
			return 0;
		}
		return Math.min(63, Math.floor(numeric));
	});
}

function hashVisitorId(value: string) {
	const digest = createHash("sha1").update(value).digest();
	return digest.readBigUInt64BE(0);
}

function registerVisitorInSketch(sketch: number[], visitorId: string) {
	const hashed = hashVisitorId(visitorId);
	const indexMask = BigInt(HLL_REGISTERS - 1);
	const index = Number(hashed & indexMask);
	let remainder = hashed >> BigInt(HLL_PRECISION);
	const maxRank = 64 - HLL_PRECISION + 1;
	let rank = 1;

	while (rank < maxRank && (remainder & 1n) === 0n) {
		rank += 1;
		remainder >>= 1n;
	}

	if (rank > sketch[index]) {
		sketch[index] = rank;
	}
}

function visitorCountFromSketch(sketch: number[]) {
	const m = HLL_REGISTERS;
	const alpha =
		m === 16 ? 0.673 : m === 32 ? 0.697 : m === 64 ? 0.709 : 0.7213 / (1 + 1.079 / m);

	let sum = 0;
	let zeros = 0;

	for (const register of sketch) {
		sum += 2 ** -register;
		if (register === 0) {
			zeros += 1;
		}
	}

	let estimate = alpha * m * m / sum;
	if (estimate <= 2.5 * m && zeros > 0) {
		estimate = m * Math.log(m / zeros);
	}

	return Math.max(0, Math.round(estimate));
}

function normalizeStatsEntry(input: unknown): StatsEntry {
	const entry = createEmptyStatsEntry();
	if (!input || typeof input !== "object") {
		return entry;
	}

	const legacy = input as LegacyStatsEntry;
	const pageviews = Number(legacy.pageviews);
	entry.pageviews = Number.isFinite(pageviews) && pageviews > 0 ? Math.floor(pageviews) : 0;
	entry.updatedAt =
		typeof legacy.updatedAt === "string" ? legacy.updatedAt : "";
	entry.visitorSketch = normalizeSketch(legacy.visitorSketch);

	if (Array.isArray(legacy.visitorIds)) {
		legacy.visitorIds.forEach((visitorId) => {
			const normalized = sanitizeVisitorId(visitorId);
			registerVisitorInSketch(entry.visitorSketch, normalized);
		});
	}

	return entry;
}

function normalizeStatsData(input: unknown): StatsData {
	if (!input || typeof input !== "object") {
		return createEmptyStats();
	}

	const raw = input as LegacyStatsData;
	const pages: Record<string, StatsEntry> = {};

	if (raw.pages && typeof raw.pages === "object") {
		Object.entries(raw.pages).forEach(([pathKey, pageEntry]) => {
			pages[normalizePathKey(pathKey)] = normalizeStatsEntry(pageEntry);
		});
	}

	return {
		site: normalizeStatsEntry(raw.site),
		pages,
	};
}

function toPublicComment(comment: StoredComment): PublicComment {
	return {
		id: comment.id,
		path: comment.path,
		author: comment.author,
		content: comment.content,
		contact: comment.contact || comment.website || undefined,
		createdAt: comment.createdAt,
	};
}

function toStatsSnapshot(stats: StatsData, pathKey: string): StatsSnapshot {
	const normalizedPath = normalizePathKey(pathKey);
	const pageEntry = stats.pages[normalizedPath] || createEmptyStatsEntry();
	const pageVisitors = visitorCountFromSketch(pageEntry.visitorSketch);
	const siteVisitors = visitorCountFromSketch(stats.site.visitorSketch);

	return {
		page: {
			path: normalizedPath,
			pageviews: pageEntry.pageviews,
			visits: pageVisitors,
			visitors: pageVisitors,
		},
		site: {
			pageviews: stats.site.pageviews,
			visits: siteVisitors,
			visitors: siteVisitors,
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
	const raw = await readJsonFile<unknown>(STATS_FILE, createEmptyStats());
	return normalizeStatsData(raw);
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

function recordVisitor(entry: StatsEntry, visitorId: string, now: string) {
	entry.pageviews += 1;
	entry.updatedAt = now;
	registerVisitorInSketch(entry.visitorSketch, visitorId);
}

export async function recordPageView(pathKey: string, visitorId: string) {
	return withProcessWriteLock(() =>
		withFileLock("stats", async () => {
			const normalizedPath = normalizePathKey(pathKey);
			const normalizedVisitorId = sanitizeVisitorId(visitorId);
			const now = new Date().toISOString();
			const stats = await readStatsData();
			const pageEntry = stats.pages[normalizedPath] || createEmptyStatsEntry(now);

			recordVisitor(stats.site, normalizedVisitorId, now);
			recordVisitor(pageEntry, normalizedVisitorId, now);
			stats.pages[normalizedPath] = pageEntry;

			await writeStatsData(stats);
			return toStatsSnapshot(stats, normalizedPath);
		}),
	);
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
	contact?: string;
	visitorId?: string;
}) {
	return withProcessWriteLock(() =>
		withFileLock("comments", async () => {
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
				contact: input.contact,
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
		}),
	);
}

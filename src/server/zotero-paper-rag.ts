import { readFile } from "node:fs/promises";
import path from "node:path";

type JsonValue =
	| string
	| number
	| boolean
	| null
	| JsonValue[]
	| { [key: string]: JsonValue };

type JsonObject = Record<string, JsonValue>;

const DEFAULT_ZOTERO_PAPER_RAG_BASE_URL = "http://127.0.0.1:8001";
const DEFAULT_ZOTERO_PAPER_RAG_ROOT = "/home/ubuntu/owen/pdf-rag-agent";
const DEFAULT_TIMEOUT_MS = 8000;

function trimTrailingSlash(value: string) {
	return value.replace(/\/+$/, "");
}

export function getZoteroPaperRagBaseUrl() {
	return trimTrailingSlash(
		process.env.ZOTERO_PAPER_RAG_BASE_URL ||
			DEFAULT_ZOTERO_PAPER_RAG_BASE_URL,
	);
}

export function getZoteroPaperRagProjectRoot() {
	return trimTrailingSlash(
		process.env.ZOTERO_PAPER_RAG_PROJECT_ROOT ||
			DEFAULT_ZOTERO_PAPER_RAG_ROOT,
	);
}

async function fetchZoteroPaperRagEndpoint(
	pathname: string,
	responseType: "json" | "text",
	timeoutMs = DEFAULT_TIMEOUT_MS,
) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	const baseUrl = getZoteroPaperRagBaseUrl();
	const url = new URL(pathname, `${baseUrl}/`);

	try {
		const response = await fetch(url, {
			method: "GET",
			headers: {
				Accept:
					responseType === "json"
						? "application/json"
						: "text/html, text/plain;q=0.9",
			},
			cache: "no-store",
			signal: controller.signal,
		});

		if (!response.ok) {
			return {
				ok: false,
				status: response.status,
				error: `${response.status} ${response.statusText}`,
				data: null,
			};
		}

		const data =
			responseType === "json"
				? ((await response.json()) as JsonObject | null)
				: await response.text();

		return {
			ok: true,
			status: response.status,
			error: null,
			data,
		};
	} catch (error) {
		return {
			ok: false,
			status: 503,
			error: error instanceof Error ? error.message : String(error),
			data: null,
		};
	} finally {
		clearTimeout(timer);
	}
}

async function readLocalIndexStats() {
	try {
		const projectRoot = getZoteroPaperRagProjectRoot();
		const statePath = path.join(projectRoot, "data", "v4_ingestion_state.json");
		const corpusPath = path.join(projectRoot, "data", "v4_blocks.jsonl");

		const [stateText, corpusText] = await Promise.all([
			readFile(statePath, "utf-8"),
			readFile(corpusPath, "utf-8"),
		]);

		const state = JSON.parse(stateText) as {
			papers?: Record<string, unknown>;
		};
		const indexedPapers = state.papers
			? Object.keys(state.papers).length
			: null;
		const corpusDocs = corpusText
			.split("\n")
			.map((line) => line.trim())
			.filter(Boolean).length;

		return {
			indexedPapers,
			corpusDocs,
			error: null,
		};
	} catch (error) {
		return {
			indexedPapers: null,
			corpusDocs: null,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

export async function getZoteroPaperRagSnapshot() {
	const [health, indexStats] = await Promise.all([
		fetchZoteroPaperRagEndpoint("/api/v1/health", "json"),
		readLocalIndexStats(),
	]);

	return {
		baseUrl: getZoteroPaperRagBaseUrl(),
		available: Boolean(health.ok),
		error: health.error || indexStats.error,
		health: (health.data as JsonObject | null) || null,
		indexedPapers: indexStats.indexedPapers,
		corpusDocs: indexStats.corpusDocs,
	};
}

export async function getZoteroPaperRagChatHtml() {
	const response = await fetchZoteroPaperRagEndpoint("/", "text", 12000);
	return {
		ok: response.ok,
		status: response.status,
		error: response.error,
		html: typeof response.data === "string" ? response.data : "",
	};
}

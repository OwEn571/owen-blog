import type { APIContext, APIRoute } from "astro";

import { injectZoteroPaperRagIframeTheme } from "../../../../server/zotero-paper-rag-iframe-theme";
import {
	getZoteroPaperRagBaseUrl,
	getZoteroPaperRagChatHtml,
} from "../../../../server/zotero-paper-rag";

export const prerender = false;

const PROXY_PREFIX = "/api/lab/zotero-paper-rag";

function buildTargetUrl(request: Request, rawPath: string) {
	const incomingUrl = new URL(request.url);
	const targetUrl = new URL(
		`/${rawPath.replace(/^\/+/, "")}`,
		`${getZoteroPaperRagBaseUrl()}/`,
	);
	targetUrl.search = incomingUrl.search;
	return targetUrl;
}

function copyRequestHeaders(source: Headers) {
	const headers = new Headers(source);
	[
		"host",
		"connection",
		"content-length",
		"transfer-encoding",
	].forEach((key) => headers.delete(key));
	return headers;
}

function copyResponseHeaders(source: Headers) {
	const headers = new Headers(source);
	["content-length", "transfer-encoding"].forEach((key) =>
		headers.delete(key),
	);
	headers.set("Cache-Control", "no-store");
	if (headers.get("content-type")?.includes("text/event-stream")) {
		headers.set("X-Accel-Buffering", "no");
		headers.set("Connection", "keep-alive");
	}
	return headers;
}

function buildChatConfigScript() {
	return `<script>window.ZOTERO_AGENT_CONFIG=${JSON.stringify({
		streamEndpoint: `${PROXY_PREFIX}/api/v1/chat/stream`,
		chatEndpoint: `${PROXY_PREFIX}/api/v1/chat`,
		healthEndpoint: `${PROXY_PREFIX}/api/v1/health`,
		libraryEndpoint: `${PROXY_PREFIX}/api/v1/library`,
		paperPreviewEndpoint: `${PROXY_PREFIX}/api/v1/library/papers`,
		citationPreviewEndpoint: `${PROXY_PREFIX}/api/v1/citations/preview`,
		sessionStorageKey: "zotero-paper-rag-lab-session-id",
	})};</script>`;
}

function rewriteChatHtml(html: string) {
	const rewrittenHtml = html
		.replace(
			/href="\/static\/([^"?]+)(\?[^"]*)?"/g,
			(_match, assetPath: string, query = "") =>
				`href="${PROXY_PREFIX}/static/${assetPath}/${query}"`,
		)
		.replace(
			/src="\/static\/([^"?]+)(\?[^"]*)?"/g,
			(_match, assetPath: string, query = "") =>
				`src="${PROXY_PREFIX}/static/${assetPath}/${query}"`,
		);

	return injectZoteroPaperRagIframeTheme(
		rewrittenHtml,
		buildChatConfigScript(),
	);
}

async function handleProxy(context: APIContext) {
	const rawPath = String(context.params.path || "").replace(/^\/+/, "");
	if (!rawPath) {
		return new Response("Missing proxied path.", { status: 400 });
	}

	if (rawPath === "ui/chat" || rawPath === "v4") {
		const chat = await getZoteroPaperRagChatHtml();
		return new Response(
			chat.ok
				? rewriteChatHtml(chat.html)
				: `<main style="font-family:system-ui;padding:2rem;line-height:1.7"><h1>Zotero Paper Agent Unavailable</h1><p>${chat.error || "Zotero Paper Agent chat UI is unavailable."}</p></main>`,
			{
				status: chat.ok ? 200 : chat.status,
				headers: {
					"Content-Type": "text/html; charset=utf-8",
					"Cache-Control": "no-store",
				},
			},
		);
	}

	const method = context.request.method.toUpperCase();
	const hasBody = !["GET", "HEAD"].includes(method);
	const targetUrl = buildTargetUrl(context.request, rawPath);

	try {
		const upstream = await fetch(targetUrl, {
			method,
			headers: copyRequestHeaders(context.request.headers),
			body: hasBody ? context.request.body : undefined,
			redirect: "manual",
			...(hasBody ? { duplex: "half" as const } : {}),
		});

		return new Response(upstream.body, {
			status: upstream.status,
			headers: copyResponseHeaders(upstream.headers),
		});
	} catch (error) {
		return new Response(
			JSON.stringify({
				error:
					error instanceof Error ? error.message : "Proxy request failed.",
			}),
			{
				status: 503,
				headers: {
					"Content-Type": "application/json; charset=utf-8",
					"Cache-Control": "no-store",
				},
			},
		);
	}
}

export const GET: APIRoute = handleProxy;
export const POST: APIRoute = handleProxy;
export const PUT: APIRoute = handleProxy;
export const PATCH: APIRoute = handleProxy;
export const DELETE: APIRoute = handleProxy;
export const OPTIONS: APIRoute = handleProxy;
export const HEAD: APIRoute = handleProxy;

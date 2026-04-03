import type { APIRoute } from "astro";

import {
	getStatsSnapshot,
	normalizePathKey,
	recordPageView,
	sanitizeVisitorId,
} from "../../server/runtime-store";

function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			"Content-Type": "application/json; charset=utf-8",
			"Cache-Control": "no-store",
		},
	});
}

export const GET: APIRoute = async ({ request }) => {
	const url = new URL(request.url);
	const path = normalizePathKey(url.searchParams.get("path") || "/");
	const snapshot = await getStatsSnapshot(path);
	return json(snapshot);
};

export const POST: APIRoute = async ({ request }) => {
	let payload: Record<string, unknown>;

	try {
		payload = (await request.json()) as Record<string, unknown>;
	} catch {
		return json({ error: "Invalid JSON body" }, 400);
	}

	const path = normalizePathKey(String(payload.path || "/"));
	const visitorId = sanitizeVisitorId(String(payload.visitorId || ""));
	const snapshot = await recordPageView(path, visitorId);
	return json(snapshot);
};

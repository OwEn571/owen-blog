import type { APIRoute } from "astro";

import {
	getStatsSnapshot,
	normalizePathKey,
	recordPageView,
} from "../../server/runtime-store";
import { resolveTrustedVisitor } from "../../server/trusted-visitor";

function json(body: unknown, status = 200, extraHeaders?: Record<string, string>) {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			"Content-Type": "application/json; charset=utf-8",
			"Cache-Control": "no-store",
			...(extraHeaders || {}),
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
	const trustedVisitor = await resolveTrustedVisitor(request);
	const snapshot = await recordPageView(path, trustedVisitor.visitorId);
	return json(
		snapshot,
		200,
		trustedVisitor.setCookie
			? {
					"Set-Cookie": trustedVisitor.setCookie,
				}
			: undefined,
	);
};

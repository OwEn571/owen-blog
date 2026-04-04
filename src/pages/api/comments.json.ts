import type { APIRoute } from "astro";

import {
	createComment,
	listComments,
	normalizePathKey,
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

function sanitizeText(input: unknown, maxLength: number) {
	return String(input || "")
		.replace(/[\u0000-\u001f\u007f]/g, " ")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, maxLength);
}

function sanitizeMultiline(input: unknown, maxLength: number) {
	return String(input || "")
		.replace(/\r\n/g, "\n")
		.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "")
		.trim()
		.slice(0, maxLength);
}

export const GET: APIRoute = async ({ request }) => {
	const url = new URL(request.url);
	const path = normalizePathKey(url.searchParams.get("path") || "/");
	const items = await listComments(path);
	return json({ items });
};

export const POST: APIRoute = async ({ request }) => {
	let payload: Record<string, unknown>;

	try {
		payload = (await request.json()) as Record<string, unknown>;
	} catch {
		return json({ error: "Invalid JSON body" }, 400);
	}

	if (String(payload.company || "").trim()) {
		return json({ ok: true, items: [] }, 202);
	}

	const path = normalizePathKey(String(payload.path || "/"));
	const author = sanitizeText(payload.author, 32);
	const content = sanitizeMultiline(payload.content, 2000);
	const contact = sanitizeText(payload.contact, 120);
	const visitorId = sanitizeVisitorId(String(payload.visitorId || ""));

	if (!author) {
		return json({ error: "author is required" }, 400);
	}

	if (!content) {
		return json({ error: "content is required" }, 400);
	}

	try {
		const result = await createComment({
			path,
			author,
			content,
			contact: contact || undefined,
			visitorId,
		});
		return json(result, 201);
	} catch (error) {
		if (
			typeof error === "object" &&
			error !== null &&
			"code" in error &&
			error.code === "COMMENT_RATE_LIMIT"
		) {
			return json({ error: "请稍等片刻再发送下一条评论。" }, 429);
		}

		if (
			typeof error === "object" &&
			error !== null &&
			"code" in error &&
			error.code === "COMMENT_DAILY_LIMIT"
		) {
			return json({ error: "今天发送的评论已经达到上限，明天再来吧。" }, 429);
		}

		return json(
			{
				error: error instanceof Error ? error.message : "Unknown error",
			},
			500,
		);
	}
};

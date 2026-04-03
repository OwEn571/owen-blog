import type { APIRoute } from "astro";

const DEFAULT_DIFY_API_BASE_URL = "https://api.dify.ai/v1";

function compilePrompt(payload: {
	message?: string;
	context?: string;
	currentPath?: string;
	currentTitle?: string;
}) {
	return [
		"你是 Owen 博客里的助手“喵喵”。请优先基于提供的站内资料回答；如果资料不足，请明确说明，再给出一般性的解释。",
		payload.context ? `【站内资料】\n${payload.context}` : "",
		payload.currentTitle || payload.currentPath
			? `【当前页面】\n${payload.currentTitle ? `标题：${payload.currentTitle}\n` : ""}${payload.currentPath ? `路径：${payload.currentPath}` : ""}`.trim()
			: "",
		`【用户问题】\n${payload.message || ""}`,
	]
		.filter(Boolean)
		.join("\n\n");
}

function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			"Content-Type": "application/json; charset=utf-8",
		},
	});
}

function sanitizeAssistantAnswer(answer: string) {
	return String(answer || "")
		.replace(/<details[\s\S]*?<\/details>/gi, "")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

function parseStreamingChatResponse(raw: string) {
	let answer = "";
	let conversationId = "";
	let streamError = "";

	for (const line of raw.split(/\r?\n/)) {
		if (!line.startsWith("data:")) {
			continue;
		}

		const payload = line.slice(5).trim();
		if (!payload || payload === "[DONE]") {
			continue;
		}

		try {
			const data = JSON.parse(payload) as Record<string, unknown>;
			if (!conversationId && typeof data.conversation_id === "string") {
				conversationId = data.conversation_id;
			}

			if (typeof data.answer === "string") {
				answer += data.answer;
			}

			if (
				!streamError &&
				typeof data.event === "string" &&
				data.event === "error" &&
				typeof data.message === "string"
			) {
				streamError = data.message;
			}
		} catch {
			continue;
		}
	}

	return {
		answer,
		conversationId,
		streamError,
	};
}

export const POST: APIRoute = async ({ request }) => {
	const difyApiBase =
		process.env.DIFY_API_BASE_URL ||
		process.env.PUBLIC_DIFY_API_BASE_URL ||
		DEFAULT_DIFY_API_BASE_URL;
	const difyApiKey = process.env.DIFY_API_KEY || process.env.PUBLIC_DIFY_API_KEY || "";

	if (!difyApiKey) {
		return json(
			{
				error:
					"Dify API key is missing. Please configure DIFY_API_KEY in the server runtime environment.",
			},
			500,
		);
	}

	let payload: Record<string, unknown>;
	try {
		payload = (await request.json()) as Record<string, unknown>;
	} catch {
		return json({ error: "Invalid JSON body" }, 400);
	}

	const message = String(payload.message || "").trim();
	if (!message) {
		return json({ error: "message is required" }, 400);
	}

	try {
		const response = await fetch(
			`${String(difyApiBase).replace(/\/+$/, "")}/chat-messages`,
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${difyApiKey}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					inputs: {
						current_path: String(payload.currentPath || ""),
						current_title: String(payload.currentTitle || ""),
					},
					query: compilePrompt({
						message,
						context: String(payload.context || ""),
						currentPath: String(payload.currentPath || ""),
						currentTitle: String(payload.currentTitle || ""),
					}),
					response_mode: "streaming",
					conversation_id: payload.conversationId || undefined,
					user: String(payload.visitorId || "owen-blog-guest"),
				}),
			},
		);

		if (!response.ok) {
			const errorText = await response.text();
			return json(
				{
					error: errorText || `Dify request failed with status ${response.status}`,
				},
				response.status,
			);
		}

		const contentType = response.headers.get("content-type") || "";
		if (contentType.includes("application/json")) {
			const data = await response.json();
			return json({
				answer: sanitizeAssistantAnswer(data.answer || ""),
				conversationId:
					data.conversation_id || payload.conversationId || "",
			});
		}

		const rawStream = await response.text();
		const data = parseStreamingChatResponse(rawStream);
		if (data.streamError) {
			return json({ error: data.streamError }, 502);
		}

		return json({
			answer: sanitizeAssistantAnswer(data.answer || ""),
			conversationId: data.conversationId || payload.conversationId || "",
		});
	} catch (error) {
		return json(
			{
				error: error instanceof Error ? error.message : "Unknown error",
			},
			500,
		);
	}
};

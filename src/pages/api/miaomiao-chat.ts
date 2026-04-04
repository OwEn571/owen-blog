import type { APIRoute } from "astro";

const DEFAULT_DIFY_API_BASE_URL = "https://api.dify.ai/v1";

function compilePrompt(payload: {
	message?: string;
	currentPath?: string;
	currentTitle?: string;
	currentDescription?: string;
	currentHeadings?: string[];
	currentPageContent?: string;
}) {
	return [
		"你是 Owen 博客里的陪读助手“喵喵”。",
		"回答规则：1. 优先依据【当前页面正文】回答。2. 不要假装读过整站索引、其他页面或仓库里没有提供给你的内容。3. 如果当前页面信息不够，直接说明“这页里没有写到”或“当前页信息不够”，然后再补充通用解释。4. 除非用户明确要求，不要输出文件路径、检索清单或资料目录。",
		payload.currentTitle || payload.currentPath || payload.currentDescription
			? [
					"【当前页面信息】",
					payload.currentTitle ? `标题：${payload.currentTitle}` : "",
					payload.currentPath ? `路径：${payload.currentPath}` : "",
					payload.currentDescription ? `摘要：${payload.currentDescription}` : "",
				]
					.filter(Boolean)
					.join("\n")
			: "",
		payload.currentHeadings?.length
			? `【当前页面目录】\n${payload.currentHeadings.join("\n")}`
			: "",
		payload.currentPageContent ? `【当前页面正文】\n${payload.currentPageContent}` : "",
		`【用户问题】\n${payload.message || ""}`,
	]
		.filter(Boolean)
		.join("\n\n");
}

function sanitizeText(input: unknown, maxLength: number) {
	return String(input || "")
		.replace(/\r\n/g, "\n")
		.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "")
		.trim()
		.slice(0, maxLength);
}

function sanitizeHeadings(input: unknown) {
	if (!Array.isArray(input)) {
		return [];
	}

	return input
		.map((item) => sanitizeText(item, 120))
		.filter(Boolean)
		.slice(0, 12);
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
	const difyApiBase = process.env.DIFY_API_BASE_URL || DEFAULT_DIFY_API_BASE_URL;
	const difyApiKey = process.env.DIFY_API_KEY || "";

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

	const currentPath = sanitizeText(payload.currentPath, 240);
	const currentTitle = sanitizeText(payload.currentTitle, 240);
	const currentDescription = sanitizeText(payload.currentDescription, 500);
	const currentHeadings = sanitizeHeadings(payload.currentHeadings);
	const currentPageContent = sanitizeText(payload.currentPageContent, 12000);

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
						current_path: currentPath,
						current_title: currentTitle,
						current_description: currentDescription,
						current_headings: currentHeadings.join("\n"),
					},
					query: compilePrompt({
						message,
						currentPath,
						currentTitle,
						currentDescription,
						currentHeadings,
						currentPageContent,
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

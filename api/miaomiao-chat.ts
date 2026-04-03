const DEFAULT_DIFY_API_BASE_URL = "https://api.dify.ai/v1";

function json(res: any, status: number, body: unknown) {
	res.statusCode = status;
	res.setHeader("Content-Type", "application/json; charset=utf-8");
	res.end(JSON.stringify(body));
}

async function readJsonBody(req: any) {
	if (req.body && typeof req.body === "object") {
		return req.body;
	}

	const chunks: Buffer[] = [];
	for await (const chunk of req) {
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
	}

	const raw = Buffer.concat(chunks).toString("utf8");
	if (!raw) {
		return {};
	}

	return JSON.parse(raw);
}

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

export default async function handler(req: any, res: any) {
	if (req.method !== "POST") {
		json(res, 405, { error: "Method not allowed" });
		return;
	}

	const difyApiBase =
		process.env.DIFY_API_BASE_URL ||
		process.env.PUBLIC_DIFY_API_BASE_URL ||
		DEFAULT_DIFY_API_BASE_URL;
	const difyApiKey = process.env.DIFY_API_KEY || process.env.PUBLIC_DIFY_API_KEY || "";

	if (!difyApiKey) {
		json(res, 500, {
			error:
				"Dify API key is missing. Please configure DIFY_API_KEY in Vercel environment variables.",
		});
		return;
	}

	try {
		const payload = await readJsonBody(req);
		const message = String(payload.message || "").trim();

		if (!message) {
			json(res, 400, { error: "message is required" });
			return;
		}

		const response = await fetch(`${String(difyApiBase).replace(/\/+$/, "")}/chat-messages`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${difyApiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				inputs: {
					current_path: payload.currentPath || "",
					current_title: payload.currentTitle || "",
				},
				query: compilePrompt(payload),
				response_mode: "blocking",
				conversation_id: payload.conversationId || undefined,
				user: payload.visitorId || "owen-blog-guest",
			}),
		});

		if (!response.ok) {
			const errorText = await response.text();
			json(res, response.status, {
				error: errorText || `Dify request failed with status ${response.status}`,
			});
			return;
		}

		const data = await response.json();
		json(res, 200, {
			answer: data.answer || "",
			conversationId: data.conversation_id || payload.conversationId || "",
		});
	} catch (error) {
		json(res, 500, {
			error: error instanceof Error ? error.message : "Unknown error",
		});
	}
}

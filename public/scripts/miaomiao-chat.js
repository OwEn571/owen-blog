(function () {
	const STORAGE_KEY = "owen-miaomiao-chat-state-v1";
	const VISITOR_KEY = "owen-miaomiao-chat-visitor-v1";
	let knowledgePromise = null;

	function createVisitorId() {
		const existing = window.localStorage.getItem(VISITOR_KEY);
		if (existing) {
			return existing;
		}

		const nextId = `miaomiao-${Math.random().toString(36).slice(2, 10)}`;
		window.localStorage.setItem(VISITOR_KEY, nextId);
		return nextId;
	}

	function escapeHtml(value) {
		return String(value)
			.replaceAll("&", "&amp;")
			.replaceAll("<", "&lt;")
			.replaceAll(">", "&gt;")
			.replaceAll('"', "&quot;")
			.replaceAll("'", "&#39;");
	}

	function normalizeText(value) {
		return String(value || "")
			.replace(/\r\n/g, "\n")
			.replace(/\u00a0/g, " ")
			.replace(/[ \t]+\n/g, "\n")
			.replace(/\n{3,}/g, "\n\n")
			.trim();
	}

	function tokenizeQuery(query) {
		const normalized = normalizeText(query).toLowerCase();
		if (!normalized) {
			return [];
		}

		const groups = normalized.match(/[\p{Script=Han}]+|[\p{L}\p{N}_-]{2,}/gu) || [];
		const tokens = new Set();

		for (const group of groups) {
			tokens.add(group);
			if (/[\p{Script=Han}]/u.test(group) && group.length <= 6) {
				for (const char of Array.from(group)) {
					tokens.add(char);
				}
			}
		}

		return Array.from(tokens);
	}

	function scoreEntry(entry, query, tokens) {
		const title = String(entry.title || "").toLowerCase();
		const path = String(entry.path || "").toLowerCase();
		const text = String(entry.text || "").toLowerCase();
		const haystack = `${title}\n${path}\n${text}`;
		const needle = normalizeText(query).toLowerCase();

		let score = 0;
		if (needle && title.includes(needle)) {
			score += 80;
		} else if (needle && path.includes(needle)) {
			score += 52;
		} else if (needle && text.includes(needle)) {
			score += 32;
		}

		for (const token of tokens) {
			if (title.includes(token)) {
				score += 18;
			} else if (path.includes(token)) {
				score += 10;
			} else if (text.includes(token)) {
				score += 5;
			}
		}

		if (entry.kind === "post") {
			score += 4;
		}

		return score;
	}

	function buildSnippet(text, query, tokens, maxLength = 260) {
		const normalized = normalizeText(text);
		if (!normalized) {
			return "";
		}

		const candidates = [normalizeText(query), ...tokens].filter(Boolean);
		let hitIndex = -1;
		let hitLength = 0;
		const lower = normalized.toLowerCase();

		for (const candidate of candidates) {
			const currentIndex = lower.indexOf(candidate.toLowerCase());
			if (currentIndex !== -1) {
				hitIndex = currentIndex;
				hitLength = candidate.length;
				break;
			}
		}

		if (hitIndex === -1) {
			return normalized.slice(0, maxLength);
		}

		const start = Math.max(0, hitIndex - Math.floor((maxLength - hitLength) / 2));
		const end = Math.min(normalized.length, start + maxLength);
		const snippet = normalized.slice(start, end);

		return `${start > 0 ? "…" : ""}${snippet}${end < normalized.length ? "…" : ""}`;
	}

	function highlightText(text, query, tokens) {
		const normalized = String(text || "");
		const candidates = [normalizeText(query), ...tokens]
			.filter(Boolean)
			.sort((left, right) => right.length - left.length);

		let result = escapeHtml(normalized);
		for (const candidate of candidates) {
			const pattern = new RegExp(candidate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
			result = result.replace(pattern, (match) => `<mark>${match}</mark>`);
		}
		return result;
	}

	async function loadKnowledge(knowledgeUrl) {
		if (!knowledgePromise) {
			knowledgePromise = fetch(knowledgeUrl, { credentials: "same-origin" })
				.then(async (response) => {
					if (!response.ok) {
						throw new Error(`Knowledge index request failed with ${response.status}`);
					}
					return response.json();
				})
				.catch((error) => {
					console.warn("[MiaoMiao] Failed to load knowledge index:", error);
					return { entries: [] };
				});
		}

		return knowledgePromise;
	}

	function rankEntries(entries, query, currentPath) {
		const tokens = tokenizeQuery(query);
		const currentPathNormalized = String(currentPath || "").replace(/\/+$/, "") || "/";
		return entries
			.map((entry) => {
				let score = scoreEntry(entry, query, tokens);
				if (entry.url && entry.url.replace(/\/+$/, "") === currentPathNormalized) {
					score += 22;
				}
				return { entry, score };
			})
			.filter((item) => item.score > 0)
			.sort((left, right) => right.score - left.score)
			.slice(0, 5);
	}

	function buildContextBundle(entries, query, currentPath, currentTitle) {
		const ranked = rankEntries(entries, query, currentPath);
		const tokens = tokenizeQuery(query);
		const references = ranked.map(({ entry }) => ({
			title: entry.title,
			url: entry.url || "",
			path: entry.path,
		}));

		const sections = [];
		if (currentTitle || currentPath) {
			sections.push(
				["当前页面", currentTitle ? `标题：${currentTitle}` : "", currentPath ? `路径：${currentPath}` : ""]
					.filter(Boolean)
					.join("\n"),
			);
		}

		if (ranked.length > 0) {
			const related = ranked
				.map(({ entry }, index) => {
					const heading = `资料 ${index + 1}｜${entry.kind === "post" ? "博客文章" : entry.kind === "doc" ? "文档" : "源码"}｜${entry.title}`;
					const location = entry.url ? `链接：${entry.url}` : `路径：${entry.path}`;
					const snippet = buildSnippet(entry.text, query, tokens);
					return `${heading}\n${location}\n${snippet}`;
				})
				.join("\n\n");
			sections.push(`站内相关资料\n${related}`);
		}

		return {
			context: sections.join("\n\n"),
			references,
		};
	}

	function persistState(state) {
		const snapshot = {
			conversationId: state.conversationId,
			visitorId: state.visitorId,
			messages: state.messages.slice(-20),
		};
		window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
	}

	function hydrateState() {
		try {
			const raw = window.sessionStorage.getItem(STORAGE_KEY);
			if (!raw) {
				return null;
			}
			const parsed = JSON.parse(raw);
			if (!parsed || !Array.isArray(parsed.messages)) {
				return null;
			}
			return parsed;
		} catch {
			return null;
		}
	}

	function renderMessages(state) {
		state.messagesEl.innerHTML = state.messages
			.map((message) => {
				const refs = Array.isArray(message.references) && message.references.length > 0
					? `<div class="miaomiao-chat-message__refs">${message.references
							.map((reference) => {
								if (reference.url) {
									return `<a class="miaomiao-chat-message__ref" href="${escapeHtml(reference.url)}" data-no-swup>${escapeHtml(reference.title)}</a>`;
								}
								return `<span class="miaomiao-chat-message__ref">${escapeHtml(reference.title || reference.path)}</span>`;
							})
							.join("")}</div>`
					: "";

				return `
					<div class="miaomiao-chat-message" data-role="${escapeHtml(message.role)}">
						<div class="miaomiao-chat-message__meta">${message.role === "assistant" ? "喵喵" : "你"}</div>
						<div class="miaomiao-chat-message__bubble">${highlightText(message.content, state.lastQuery, tokenizeQuery(state.lastQuery))}</div>
						${refs}
					</div>
				`;
			})
			.join("");

		state.messagesEl.scrollTop = state.messagesEl.scrollHeight;
	}

	function setStatus(state, value) {
		state.statusEl.textContent = value;
	}

	function setPanelOpen(state, nextOpen) {
		state.isOpen = nextOpen;
		state.toggleButton.setAttribute("aria-expanded", String(nextOpen));
		state.panel.hidden = !nextOpen;
		state.panel.setAttribute("aria-hidden", String(!nextOpen));
		if (nextOpen) {
			requestAnimationFrame(() => {
				state.inputEl.focus();
			});
		}
	}

	async function callProxy(proxyUrl, payload) {
		const response = await fetch(proxyUrl, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(payload),
		});
		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(errorText || `Proxy request failed with ${response.status}`);
		}
		return response.json();
	}

	async function callDifyDirect(config, payload) {
		if (!config.publicApiKey) {
			throw new Error("Dify API key is not configured.");
		}

		const compiledQuery = [
			"你是 Owen 博客里的助手“喵喵”。优先根据提供的站内资料回答；如果资料不足，请明确说明，再给出一般性解释。",
			payload.context ? `【站内资料】\n${payload.context}` : "",
			payload.currentTitle || payload.currentPath
				? `【当前页面】\n${payload.currentTitle ? `标题：${payload.currentTitle}\n` : ""}${payload.currentPath ? `路径：${payload.currentPath}` : ""}`.trim()
				: "",
			`【用户问题】\n${payload.message}`,
		]
			.filter(Boolean)
			.join("\n\n");

		const response = await fetch(
			`${String(config.publicApiBase || "https://api.dify.ai/v1").replace(/\/+$/, "")}/chat-messages`,
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${config.publicApiKey}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					inputs: {
						current_path: payload.currentPath || "",
						current_title: payload.currentTitle || "",
					},
					query: compiledQuery,
					response_mode: "blocking",
					conversation_id: payload.conversationId || undefined,
					user: payload.visitorId,
				}),
			},
		);

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(errorText || `Dify request failed with ${response.status}`);
		}

		const data = await response.json();
		return {
			answer: data.answer || "喵喵这次没有拿到回答。",
			conversationId: data.conversation_id || payload.conversationId || "",
		};
	}

	async function sendMessage(state) {
		const message = normalizeText(state.inputEl.value);
		if (!message || state.isSending) {
			return;
		}

		state.isSending = true;
		state.lastQuery = message;
		state.inputEl.value = "";
		state.messages.push({ role: "user", content: message });
		renderMessages(state);
		setStatus(state, "喵喵正在检索站内资料并组织上下文…");

		try {
			const knowledgePayload = await loadKnowledge(state.config.knowledgeUrl);
			const bundle = buildContextBundle(
				Array.isArray(knowledgePayload.entries) ? knowledgePayload.entries : [],
				message,
				window.location.pathname,
				document.title,
			);

			setStatus(state, "喵喵正在和 Dify 对话…");

			const payload = {
				message,
				conversationId: state.conversationId,
				visitorId: state.visitorId,
				currentPath: window.location.pathname,
				currentTitle: document.title,
				context: bundle.context,
			};

			let responseData;
			try {
				responseData = await callProxy(state.config.proxyUrl, payload);
			} catch (proxyError) {
				console.warn("[MiaoMiao] Proxy request failed, trying direct mode:", proxyError);
				responseData = await callDifyDirect(state.config, payload);
			}

			state.conversationId = responseData.conversationId || state.conversationId;
			state.messages.push({
				role: "assistant",
				content: normalizeText(responseData.answer || "喵喵这次没有拿到回答。"),
				references: bundle.references,
			});
			setStatus(state, "资料检索与对话已完成。");
			persistState(state);
			renderMessages(state);
		} catch (error) {
			console.error("[MiaoMiao] send failed:", error);
			const messageText =
				error instanceof Error && error.message
					? error.message
					: "喵喵暂时没有接通成功。";
			state.messages.push({
				role: "assistant",
				content:
					`喵喵这次没有成功连上。\n\n${messageText}\n\n如果你现在是本地静态开发环境，需要启用 PUBLIC_DIFY_API_KEY 直连，或在 Vercel 上配置 DIFY_API_KEY 服务端代理。`,
			});
			setStatus(state, "喵喵暂时掉线了，请稍后再试。");
			renderMessages(state);
		} finally {
			state.isSending = false;
		}
	}

	window.__owenInitMiaoMiaoChat = function initMiaoMiaoChat(root, config) {
		if (!(root instanceof HTMLElement) || root.dataset.miaomiaoReady === "true") {
			return;
		}

		const toggleButton = root.querySelector("[data-miaomiao-chat-toggle]");
		const panel = root.querySelector("[data-miaomiao-chat-panel]");
		const closeButton = root.querySelector("[data-miaomiao-chat-close]");
		const statusEl = root.querySelector("[data-miaomiao-chat-status]");
		const messagesEl = root.querySelector("[data-miaomiao-chat-messages]");
		const form = root.querySelector("[data-miaomiao-chat-form]");
		const inputEl = root.querySelector("[data-miaomiao-chat-input]");
		const resetButton = root.querySelector("[data-miaomiao-chat-reset]");

		if (
			!(toggleButton instanceof HTMLButtonElement) ||
			!(panel instanceof HTMLElement) ||
			!(closeButton instanceof HTMLButtonElement) ||
			!(statusEl instanceof HTMLElement) ||
			!(messagesEl instanceof HTMLElement) ||
			!(form instanceof HTMLFormElement) ||
			!(inputEl instanceof HTMLTextAreaElement) ||
			!(resetButton instanceof HTMLButtonElement)
		) {
			return;
		}

		root.dataset.miaomiaoReady = "true";

		const hydrated = hydrateState();
		const state = {
			root,
			config,
			toggleButton,
			panel,
			closeButton,
			statusEl,
			messagesEl,
			form,
			inputEl,
			resetButton,
			isOpen: false,
			isSending: false,
			lastQuery: "",
			visitorId: hydrated?.visitorId || createVisitorId(),
			conversationId: hydrated?.conversationId || "",
			messages:
				hydrated?.messages?.length > 0
					? hydrated.messages
					: [
							{
								role: "assistant",
								content:
									"喵，我是喵喵。现在我会先检索博客里的文章、文档和站内源码摘要，再把相关内容带去和 Dify 对话。你可以直接问当前页面，也可以问整个站点。",
							},
						],
		};

		renderMessages(state);
		setStatus(state, "喵喵已待命，可以直接开始问。");
		persistState(state);

		const openPanel = () => {
			setPanelOpen(state, true);
		};

		const closePanel = () => {
			setPanelOpen(state, false);
		};

		toggleButton.addEventListener("click", (event) => {
			event.preventDefault();
			event.stopPropagation();
			setPanelOpen(state, !state.isOpen);
		});

		closeButton.addEventListener("click", (event) => {
			event.preventDefault();
			closePanel();
		});

		resetButton.addEventListener("click", () => {
			state.conversationId = "";
			state.messages = [
				{
					role: "assistant",
					content:
						"新对话已经开始。你可以继续问当前页面、博客文章，或者站内实现细节。",
				},
			];
			setStatus(state, "已开始新的对话。");
			persistState(state);
			renderMessages(state);
		});

		form.addEventListener("submit", async (event) => {
			event.preventDefault();
			await sendMessage(state);
		});

		inputEl.addEventListener("keydown", async (event) => {
			if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
				event.preventDefault();
				await sendMessage(state);
			}
		});

		document.addEventListener("mousedown", (event) => {
			if (!state.isOpen) {
				return;
			}
			const target = event.target;
			if (!(target instanceof Element)) {
				return;
			}
			if (target.closest("[data-miaomiao-chat]")) {
				return;
			}
			closePanel();
		});

		document.addEventListener("keydown", (event) => {
			if (event.key === "Escape" && state.isOpen) {
				closePanel();
			}
		});

		window.addEventListener("pageshow", () => {
			renderMessages(state);
		});

		loadKnowledge(config.knowledgeUrl).then(() => {
			if (!state.isSending) {
				setStatus(state, "喵喵的站内资料索引已加载完成。");
			}
		});
	};
})();

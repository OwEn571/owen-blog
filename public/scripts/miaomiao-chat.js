	(function () {
		const STORAGE_KEY = "owen-miaomiao-chat-state-v2";
		const SHARE_PAGE_KEY = "owen-miaomiao-share-page-v1";
		const VISITOR_KEY = "owen-miaomiao-chat-visitor-v1";
	const REMOVE_SELECTORS = [
		"script",
		"style",
		"noscript",
		"svg",
		"button",
		"input",
		"textarea",
		"select",
		"form",
		"nav",
		"aside",
		"footer",
		".footer",
		".owen-comments",
		"[data-miaomiao-chat]",
		".miaomiao-chat-shell",
		".python-lab-shell",
		".floating-utility-rail",
		".post-reading-strip",
		".post-metadata-shell",
		"#share-component",
		"#license-component",
		".license-container",
		".post-support-card",
		"#toc-container",
		"#toc-wrapper",
		"table-of-contents",
		"[data-pagefind-ignore]",
	].join(",");
		const CONTENT_CANDIDATES = [
			[".post-markdown-flow", 2100],
			[".markdown-content", 1900],
			[".custom-md", 1700],
			["#post-container", 1400],
			["article", 900],
			["main", 400],
		];

	function safeStorageGet(storage, key) {
		try {
			return storage.getItem(key);
		} catch {
			return null;
		}
	}

	function safeStorageSet(storage, key, value) {
		try {
			storage.setItem(key, value);
		} catch {
			// Ignore storage failures in private browsing and restricted contexts.
		}
	}

	function createRandomId(prefix) {
		if (window.crypto && typeof window.crypto.randomUUID === "function") {
			return `${prefix}${window.crypto.randomUUID().replace(/-/g, "")}`;
		}
		return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
	}

	function getVisitorId() {
		const existing = safeStorageGet(window.localStorage, VISITOR_KEY);
		if (existing) {
			return existing;
		}

		const next = createRandomId("miaomiao-");
		safeStorageSet(window.localStorage, VISITOR_KEY, next);
		return next;
	}

	function escapeHtml(value) {
		return String(value || "")
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
			.replace(/[ \t]{2,}/g, " ")
			.trim();
	}

	function limitText(value, maxLength) {
		const text = normalizeText(value);
		if (!text || text.length <= maxLength) {
			return text;
		}
		return `${text.slice(0, maxLength).trimEnd()}…`;
	}

	function renderMessageHtml(value) {
		const blocks = normalizeText(value)
			.split(/\n{2,}/)
			.map((block) => block.trim())
			.filter(Boolean);

		if (!blocks.length) {
			return "<p></p>";
		}

		return blocks
			.map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br>")}</p>`)
			.join("");
	}

	function getVisibleText(element) {
		if (!(element instanceof Element)) {
			return "";
		}

		const clone = element.cloneNode(true);
		if (!(clone instanceof Element)) {
			return normalizeText(element.textContent || "");
		}

		clone.querySelectorAll(REMOVE_SELECTORS).forEach((node) => node.remove());
		return normalizeText(clone.textContent || "");
	}

	function getPageTitle() {
		const titleCandidate = document.querySelector(
			".post-article-title, [data-pagefind-meta='title'], h1",
		);
		const explicitTitle = normalizeText(titleCandidate?.textContent || "");
		if (explicitTitle) {
			return explicitTitle.slice(0, 160);
		}

		const rawTitle = normalizeText(document.title || "");
		return rawTitle.replace(/\s*[|｜·-]\s*.+$/, "").trim() || "当前页面";
	}

	function getPageDescription() {
		const lead = document.querySelector(".post-description-lead");
		const leadText = normalizeText(lead?.textContent || "");
		if (leadText) {
			return leadText.slice(0, 260);
		}

		const metaDescription = document.querySelector('meta[name="description"]');
		return normalizeText(metaDescription?.getAttribute("content") || "").slice(0, 260);
	}

	function getHeadings(root) {
		if (!(root instanceof Element)) {
			return [];
		}

		const seen = new Set();
		const headings = [];

		root.querySelectorAll("h1, h2, h3").forEach((heading) => {
			const text = limitText(heading.textContent || "", 120);
			if (!text || seen.has(text)) {
				return;
			}
			seen.add(text);
			headings.push(text);
		});

		return headings.slice(0, 12);
	}

	function findBestContentRoot() {
		let best = null;

		for (const [selector, bonus] of CONTENT_CANDIDATES) {
			document.querySelectorAll(selector).forEach((node) => {
				if (!(node instanceof Element)) {
					return;
				}

				if (node.closest("[data-miaomiao-chat]")) {
					return;
				}

				const text = getVisibleText(node);
				if (text.length < 120) {
					return;
				}

				const score = text.length + bonus;
				if (!best || score > best.score) {
					best = { node, text, score };
				}
			});
		}

		return best?.node || null;
	}

	function extractCurrentPageContext(shareDetailedContent) {
		const path = window.location.pathname || "/";
		const title = getPageTitle();
		const description = getPageDescription();
		if (!shareDetailedContent) {
			return {
				path,
				title,
				description,
				headings: [],
				content: "",
			};
		}
		const contentRoot = findBestContentRoot();
		const bodyText = limitText(contentRoot ? getVisibleText(contentRoot) : "", 2800);
		const headings = contentRoot ? getHeadings(contentRoot) : [];

		return {
			path,
			title,
			description,
			headings,
			content: bodyText,
		};
	}

	function persistSharePreference(value) {
		safeStorageSet(window.localStorage, SHARE_PAGE_KEY, value ? "true" : "false");
	}

	function hydrateSharePreference() {
		return safeStorageGet(window.localStorage, SHARE_PAGE_KEY) === "true";
	}

	function createWelcomeMessage(context) {
		return `喵，我先陪你读《${context.title || "这一页"}》。你可以让我总结这页、把难点讲白，或者直接追问卡住的地方。`;
	}

	function persistState(state) {
		const snapshot = {
			path: state.currentPath,
			conversationId: state.conversationId,
			visitorId: state.visitorId,
			messages: state.messages.slice(-20),
		};
		safeStorageSet(window.sessionStorage, STORAGE_KEY, JSON.stringify(snapshot));
	}

	function hydrateState() {
		const raw = safeStorageGet(window.sessionStorage, STORAGE_KEY);
		if (!raw) {
			return null;
		}

		try {
			const parsed = JSON.parse(raw);
			if (!parsed || !Array.isArray(parsed.messages)) {
				return null;
			}
			return parsed;
		} catch {
			return null;
		}
	}

	function syncPageContext(state) {
		const context = extractCurrentPageContext(state.sharePageContext);
		state.currentContext = context;
		state.currentPath = context.path;

		if (state.pageTitleEl instanceof HTMLElement) {
			state.pageTitleEl.textContent = context.title || "当前页面";
		}

		if (state.pagePathEl instanceof HTMLElement) {
			state.pagePathEl.textContent = context.path || "/";
		}

		return context;
	}

	function setComposerBusy(state, busy) {
		state.isSending = busy;
		state.inputEl.readOnly = busy;

		if (state.sendButton instanceof HTMLButtonElement) {
			state.sendButton.disabled = busy;
			state.sendButton.textContent = busy ? "发送中..." : "发送";
		}

		if (state.resetButton instanceof HTMLButtonElement) {
			state.resetButton.disabled = busy;
		}

		state.promptButtons.forEach((button) => {
			button.disabled = busy;
		});
	}

	function renderMessages(state) {
		const items = state.messages.map((message) => {
			const label = message.role === "assistant" ? "喵喵" : "你";
			const avatar = message.role === "assistant" ? "喵" : "你";
			const tone = message.tone || "default";

			return `
				<div class="miaomiao-chat-message" data-role="${escapeHtml(message.role)}" data-tone="${escapeHtml(tone)}">
					<div class="miaomiao-chat-message__row">
						<div class="miaomiao-chat-message__avatar">${avatar}</div>
						<div class="miaomiao-chat-message__content">
							<div class="miaomiao-chat-message__meta">${label}</div>
							<div class="miaomiao-chat-message__bubble">${renderMessageHtml(message.content)}</div>
						</div>
					</div>
				</div>
			`;
		});

		if (state.isSending) {
			items.push(`
				<div class="miaomiao-chat-message miaomiao-chat-message--pending" data-role="assistant">
					<div class="miaomiao-chat-message__row">
						<div class="miaomiao-chat-message__avatar">喵</div>
						<div class="miaomiao-chat-message__content">
							<div class="miaomiao-chat-message__meta">喵喵</div>
							<div class="miaomiao-chat-message__bubble">
								<span class="miaomiao-chat-message__typing" aria-hidden="true">
									<span class="miaomiao-chat-message__typing-dot"></span>
									<span class="miaomiao-chat-message__typing-dot"></span>
									<span class="miaomiao-chat-message__typing-dot"></span>
								</span>
							</div>
						</div>
					</div>
				</div>
			`);
		}

		state.messagesEl.innerHTML = items.join("");
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

		let data = null;
		try {
			data = await response.json();
		} catch {
			data = null;
		}

		if (!response.ok) {
			const message =
				(data && typeof data.error === "string" && data.error) ||
				`Proxy request failed with ${response.status}`;
			throw new Error(message);
		}

		return data || {};
	}

	async function sendMessage(state) {
		const message = normalizeText(state.inputEl.value);
		if (!message || state.isSending) {
			return;
		}

		const pageContext = syncPageContext(state);

		setComposerBusy(state, true);
		state.inputEl.value = "";
		state.messages.push({ role: "user", content: message });
		renderMessages(state);
		setStatus(
			state,
			pageContext.content
				? "我先读一遍这一页，再组织回答..."
				: "这一页正文没抓到太多内容，我先按眼前信息试着回答...",
		);

		try {
			const responseData = await callProxy(state.config.proxyUrl, {
				message,
				conversationId: state.conversationId,
				visitorId: state.visitorId,
				shareCurrentPage: state.sharePageContext,
				currentPath: pageContext.path,
				currentTitle: pageContext.title,
				currentDescription: pageContext.description,
				currentHeadings: state.sharePageContext ? pageContext.headings : [],
				currentPageContent: state.sharePageContext ? pageContext.content : "",
			});

			state.conversationId = responseData.conversationId || state.conversationId || "";
			state.messages.push({
				role: "assistant",
				content: normalizeText(responseData.answer || "喵喵这次没有拿到回答。"),
			});
			setStatus(
				state,
				pageContext.content
					? "这次回答已经结合当前页面正文。"
					: state.sharePageContext
						? "这次回答主要按通用理解组织，因为当前页正文不够完整。"
						: "这次没有发送页面正文，只按标题和基础信息帮你整理。",
			);
		} catch (error) {
			console.error("[MiaoMiao] send failed:", error);
			const messageText =
				error instanceof Error && error.message
					? error.message
					: "暂时没有接通成功。";
			state.messages.push({
				role: "assistant",
				tone: "error",
				content: `这次没有连上喵。\n\n${messageText}\n\n你可以稍后再试，我会继续优先围绕当前页面回答。`,
			});
			setStatus(state, "喵喵刚才掉线了，稍后再试一次。");
		} finally {
			persistState(state);
			setComposerBusy(state, false);
			renderMessages(state);
		}
	}

	function resetConversation(state, copy) {
		state.conversationId = "";
		state.messages = [
			{
				role: "assistant",
				content: copy || createWelcomeMessage(state.currentContext),
			},
		];
		persistState(state);
		renderMessages(state);
	}

	function handlePageChange(state) {
		const previousPath = state.currentPath;
		const nextContext = syncPageContext(state);

		if (previousPath && previousPath !== nextContext.path) {
			resetConversation(
				state,
				`我们已经切到《${nextContext.title || "新页面"}》。我会先按这页正文来回答，你可以继续追问。`,
			);
			setStatus(state, "已经跟到新页面，会先读这页。");
			return;
		}

		persistState(state);
		renderMessages(state);
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
		const sendButton = root.querySelector("[data-miaomiao-chat-send]");
		const pageTitleEl = root.querySelector("[data-miaomiao-chat-page-title]");
		const pagePathEl = root.querySelector("[data-miaomiao-chat-page-path]");
		const shareToggle = root.querySelector("[data-miaomiao-chat-share-toggle]");
		const promptButtons = Array.from(
			root.querySelectorAll("[data-miaomiao-chat-prompt]"),
		).filter((button) => button instanceof HTMLButtonElement);

		if (
			!(toggleButton instanceof HTMLButtonElement) ||
			!(panel instanceof HTMLElement) ||
			!(closeButton instanceof HTMLButtonElement) ||
			!(statusEl instanceof HTMLElement) ||
			!(messagesEl instanceof HTMLElement) ||
			!(form instanceof HTMLFormElement) ||
			!(inputEl instanceof HTMLTextAreaElement) ||
			!(resetButton instanceof HTMLButtonElement) ||
			!(sendButton instanceof HTMLButtonElement) ||
			!(shareToggle instanceof HTMLInputElement)
		) {
			return;
		}

		root.dataset.miaomiaoReady = "true";

		const sharePageContext = hydrateSharePreference();
		const initialContext = extractCurrentPageContext(sharePageContext);
		const hydrated = hydrateState();
		const messages =
			hydrated?.path === initialContext.path && Array.isArray(hydrated.messages) && hydrated.messages.length
				? hydrated.messages
				: [{ role: "assistant", content: createWelcomeMessage(initialContext) }];

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
			sendButton,
			pageTitleEl,
			pagePathEl,
			shareToggle,
			promptButtons,
			currentContext: initialContext,
			currentPath: initialContext.path,
			sharePageContext,
			isOpen: false,
			isSending: false,
			visitorId: hydrated?.visitorId || getVisitorId(),
			conversationId:
				hydrated?.path === initialContext.path ? hydrated?.conversationId || "" : "",
			messages,
		};

		syncPageContext(state);
		state.shareToggle.checked = state.sharePageContext;
		setComposerBusy(state, false);
		renderMessages(state);
		setStatus(
			state,
			state.sharePageContext
				? "喵喵会结合当前页摘要回答。"
				: "默认不会发送页面正文，只用标题和基础信息回答。",
		);
		persistState(state);

		toggleButton.addEventListener("click", (event) => {
			event.preventDefault();
			event.stopPropagation();
			setPanelOpen(state, !state.isOpen);
		});

		closeButton.addEventListener("click", (event) => {
			event.preventDefault();
			setPanelOpen(state, false);
		});

		resetButton.addEventListener("click", () => {
			resetConversation(state);
			setStatus(state, "已经开始新的对话。");
		});

		shareToggle.addEventListener("change", () => {
			state.sharePageContext = shareToggle.checked;
			persistSharePreference(state.sharePageContext);
			syncPageContext(state);
			setStatus(
				state,
				state.sharePageContext
					? "已允许发送当前页摘要给喵喵。"
					: "已关闭页面摘要外发，喵喵只会收到标题和基础信息。",
			);
			persistState(state);
		});

		promptButtons.forEach((button) => {
			button.addEventListener("click", async () => {
				const prompt = button.dataset.miaomiaoChatPrompt || "";
				if (!prompt || state.isSending) {
					return;
				}
				state.inputEl.value = prompt;
				await sendMessage(state);
			});
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

			setPanelOpen(state, false);
		});

		document.addEventListener("keydown", (event) => {
			if (event.key === "Escape" && state.isOpen) {
				setPanelOpen(state, false);
			}
		});

		window.addEventListener("pageshow", () => {
			handlePageChange(state);
		});

		document.addEventListener("owen-blog:page:loaded", () => {
			handlePageChange(state);
		});
	};
})();

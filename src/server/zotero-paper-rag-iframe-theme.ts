function injectBeforeHeadEnd(html: string, payload: string) {
	if (html.includes("</head>")) {
		return html.replace("</head>", `${payload}</head>`);
	}
	return `${payload}${html}`;
}

const themeBridgeScript = String.raw`
<script data-zotero-paper-rag-theme-bridge>
	(function () {
		const root = document.documentElement;

		function readDarkMode() {
			try {
				if (window.parent && window.parent !== window) {
					return window.parent.document.documentElement.classList.contains("dark");
				}
			} catch {}

			try {
				const theme = localStorage.getItem("theme") || "system";
				if (theme === "dark") return true;
				if (theme === "light") return false;
				return window.matchMedia("(prefers-color-scheme: dark)").matches;
			} catch {}

			try {
				return window.matchMedia("(prefers-color-scheme: dark)").matches;
			} catch {}

			return root.classList.contains("dark");
		}

		function applyTheme() {
			const isDark = readDarkMode();
			root.dataset.theme = isDark ? "dark" : "light";
			root.style.colorScheme = isDark ? "dark" : "light";
		}

		applyTheme();

		try {
			if (window.parent && window.parent !== window) {
				const parentRoot = window.parent.document.documentElement;
				new MutationObserver(applyTheme).observe(parentRoot, {
					attributes: true,
					attributeFilter: ["class"],
				});
			}
		} catch {}

		window.addEventListener("storage", applyTheme);
		window.addEventListener("focus", applyTheme);
		document.addEventListener("visibilitychange", applyTheme);
		try {
			const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
			if (typeof mediaQuery.addEventListener === "function") {
				mediaQuery.addEventListener("change", applyTheme);
			} else if (typeof mediaQuery.addListener === "function") {
				mediaQuery.addListener(applyTheme);
			}
		} catch {}
	})();
</script>
`;

const themeStyle = String.raw`
<style data-zotero-paper-rag-theme-bridge>
	/* ── Dark mode overrides for Paper Agent V4 (matches v4.html structure) ── */
	:root[data-theme="dark"] {
		--bg: #0c1417;
		--surface: #141e1c;
		--surface-2: #1b2825;
		--surface-3: #22322e;
		--text: #edf6f6;
		--muted: #9bb2b6;
		--faint: #6e8482;
		--border: #30423e;
		--border-strong: #465a55;
		--accent: #68c5ba;
		--accent-2: #d49a55;
		--accent-soft: rgba(104, 197, 186, 0.12);
		--warning: #d49a55;
		--warning-soft: rgba(212, 154, 85, 0.16);
		--danger: #d9877f;
		--danger-soft: rgba(217, 135, 127, 0.14);
		--ok: #68c79f;
		--shadow: 0 16px 36px rgba(0, 0, 0, 0.32);
		color-scheme: dark;
	}

	:root[data-theme="dark"] body {
		background: var(--bg);
		color: var(--text);
	}

	/* Layout panels */
	:root[data-theme="dark"] .sidebar {
		background: var(--surface);
		border-right-color: var(--border);
	}
	:root[data-theme="dark"] .chat {
		background: var(--bg);
	}
	:root[data-theme="dark"] .inspector {
		background: var(--surface);
		border-left-color: var(--border);
	}
	:root[data-theme="dark"] .chat-top {
		background: var(--surface);
		border-bottom-color: var(--border);
	}

	/* Pipeline strip */
	:root[data-theme="dark"] .pipeline-strip {
		border-bottom-color: var(--border);
	}
	:root[data-theme="dark"] .pipeline-strip .metric {
		border-right-color: var(--border);
	}

	/* Messages */
	:root[data-theme="dark"] .message.assistant .bubble {
		background: var(--surface-2);
	}
	:root[data-theme="dark"] .message.user .bubble {
		background: var(--accent);
		color: #fff;
	}
	:root[data-theme="dark"] .bubble-body.markdown code {
		background: var(--surface-3);
		color: var(--text);
	}
	:root[data-theme="dark"] .bubble-body.markdown pre {
		background: #091215;
		color: var(--text);
	}
	:root[data-theme="dark"] .bubble-body.markdown blockquote {
		background: var(--accent-soft);
		border-left-color: var(--accent);
		color: var(--muted);
	}
	:root[data-theme="dark"] .bubble-body.markdown a {
		color: var(--accent);
	}
	:root[data-theme="dark"] .bubble-body.markdown strong {
		color: var(--text);
	}

	/* Composer */
	:root[data-theme="dark"] .composer-wrap {
		border-top-color: var(--border);
	}
	:root[data-theme="dark"] .composer textarea {
		background: var(--surface-2);
		border-color: var(--border-strong);
		color: var(--text);
	}
	:root[data-theme="dark"] .composer textarea::placeholder {
		color: var(--faint);
	}

	/* Cards, pills, panels */
	:root[data-theme="dark"] .pill {
		background: var(--surface-2);
		color: var(--muted);
	}
	:root[data-theme="dark"] .card {
		background: var(--surface-2);
	}
	:root[data-theme="dark"] .card .kv {
		border-bottom-color: var(--border);
	}
	:root[data-theme="dark"] .card .kv .k {
		color: var(--muted);
	}
	:root[data-theme="dark"] .card h3 {
		color: var(--faint);
	}

	/* Sidebar */
	:root[data-theme="dark"] .segmented {
		background: var(--surface-2);
	}
	:root[data-theme="dark"] .segmented button.active {
		background: var(--surface);
		color: var(--text);
	}
	:root[data-theme="dark"] .history-item:hover,
	:root[data-theme="dark"] .paper-item:hover {
		background: var(--surface-2);
	}
	:root[data-theme="dark"] .history-item.active {
		background: var(--accent-soft);
	}
	:root[data-theme="dark"] .new-btn {
		background: var(--accent);
	}

	/* Inspector tabs */
	:root[data-theme="dark"] .tab-btn.active {
		background: var(--surface-2);
		color: var(--text);
	}

	/* Welcome */
	:root[data-theme="dark"] .welcome {
		background: var(--surface);
	}

	/* Run graph */
	:root[data-theme="dark"] .flowchart {
		background: var(--surface-2);
	}
	:root[data-theme="dark"] .flow-node {
		background: var(--surface-3);
		border-color: var(--border);
	}
	:root[data-theme="dark"] .flow-node.running {
		border-color: var(--accent);
		background: var(--accent-soft);
	}
	:root[data-theme="dark"] .flow-node.finished {
		background: var(--accent-soft);
		border-color: var(--accent);
	}
	:root[data-theme="dark"] .timeline-item {
		border-left-color: var(--border);
	}

	/* Evidence items */
	:root[data-theme="dark"] .evidence-item {
		background: var(--surface-2);
	}
	:root[data-theme="dark"] .evidence-item:hover {
		border-left-color: var(--accent);
	}

	/* Todo items */
	:root[data-theme="dark"] .todo-item.doing {
		background: var(--accent-soft);
	}

	/* Clarification */
	:root[data-theme="dark"] .clarification-choice {
		background: var(--surface);
		border-color: var(--accent);
		color: var(--text);
	}
	:root[data-theme="dark"] .clarification-choice:hover {
		background: var(--accent);
		color: #fff;
	}

	/* Progress spinner */
	:root[data-theme="dark"] .progress .spinner {
		border-color: var(--border-strong);
		border-top-color: var(--accent);
	}

	/* Scrollbar */
	:root[data-theme="dark"] ::-webkit-scrollbar-thumb {
		background: rgba(155, 178, 182, 0.28);
	}

	/* Empty / muted */
	:root[data-theme="dark"] .empty-note,
	:root[data-theme="dark"] .section-label {
		color: var(--faint);
	}
	:root[data-theme="dark"] .eyebrow {
		color: var(--faint);
	}

	/* Paper list */
	:root[data-theme="dark"] .paper-category summary {
		color: var(--muted);
	}
	:root[data-theme="dark"] .paper-meta {
		color: var(--faint);
	}

	/* Select / input */
	:root[data-theme="dark"] select,
	:root[data-theme="dark"] input.search {
		background: var(--surface-2);
		border-color: var(--border-strong);
		color: var(--text);
	}

	/* Lucide icons */
	:root[data-theme="dark"] svg[data-lucide] {
		color: var(--muted);
	}
	:root[data-theme="dark"] .icon-btn:hover svg[data-lucide] {
		color: var(--text);
	}
</style>
`;

export function injectZoteroPaperRagIframeTheme(
	html: string,
	configScript = "",
) {
	return injectBeforeHeadEnd(
		html,
		`${configScript}${themeBridgeScript}${themeStyle}`,
	);
}

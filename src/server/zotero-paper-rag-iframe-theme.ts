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
				if (theme === "dark") {
					return true;
				}
				if (theme === "light") {
					return false;
				}
				return window.matchMedia("(prefers-color-scheme: dark)").matches;
			} catch {}

			try {
				return window.matchMedia("(prefers-color-scheme: dark)").matches;
			} catch {}

			return root.classList.contains("dark");
		}

		function applyTheme() {
			const isDark = readDarkMode();
			root.dataset.themeMode = isDark ? "dark" : "light";
			root.style.colorScheme = isDark ? "dark" : "light";
			root.classList.toggle("dark", isDark);
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
	:root[data-theme-mode="dark"] {
		--bg: #0c1417;
		--bg-accent: #132226;
		--panel: rgba(17, 25, 29, 0.88);
		--panel-strong: rgba(22, 30, 34, 0.96);
		--panel-muted: rgba(29, 39, 45, 0.82);
		--card: rgba(24, 34, 38, 0.82);
		--card-strong: rgba(27, 38, 43, 0.92);
		--line: rgba(160, 186, 189, 0.14);
		--line-strong: rgba(182, 208, 211, 0.24);
		--text: #edf6f6;
		--muted: #9bb2b6;
		--accent: #68c5ba;
		--accent-soft: rgba(104, 197, 186, 0.12);
		--warm: #d49a55;
		--warm-soft: rgba(212, 154, 85, 0.16);
		--danger: #d9877f;
		--shadow: 0 20px 48px rgba(0, 0, 0, 0.32);
		--shadow-soft: 0 12px 28px rgba(0, 0, 0, 0.2);
	}

	:root[data-theme-mode="dark"],
	:root[data-theme-mode="dark"] body {
		color-scheme: dark;
	}

	:root[data-theme-mode="dark"] body {
		background:
			radial-gradient(circle at top left, rgba(212, 154, 85, 0.12), transparent 26%),
			radial-gradient(circle at top right, rgba(104, 197, 186, 0.14), transparent 22%),
			linear-gradient(180deg, #10181b 0%, var(--bg) 100%);
		color: var(--text);
	}

	:root[data-theme-mode="dark"] body::before {
		background-image: linear-gradient(rgba(237, 246, 246, 0.024) 1px, transparent 1px);
	}

	:root[data-theme-mode="dark"] :is(
		.hero-chip,
		.session-card,
		.plan-card,
		.plan-action-btn,
		.plan-query-item,
		.welcome-guide,
		.suggestion-btn,
		.ghost-btn,
		.control,
		.toggle,
		.composer textarea,
		.composer-hint,
		.tabbar,
		.tab,
		.panel-section,
		.graph-section,
		.graph-status-pill,
		.graph-node,
		.json-card,
		.raw-stream,
		.timeline-item,
		.trace-card,
		.citation-card,
		.badge,
		.trace-snippet
	) {
		background: var(--card) !important;
		border-color: var(--line) !important;
		color: var(--text) !important;
		box-shadow: var(--shadow-soft) !important;
	}

	:root[data-theme-mode="dark"] :is(.chat-panel, .inspector) {
		background: linear-gradient(180deg, var(--panel-strong), var(--panel)) !important;
		border-color: var(--line) !important;
		box-shadow: var(--shadow) !important;
	}

	:root[data-theme-mode="dark"] :is(.welcome-card, .message.assistant .bubble, .composer-wrap) {
		background:
			radial-gradient(circle at top right, rgba(212, 154, 85, 0.08), transparent 34%),
			linear-gradient(180deg, rgba(19, 30, 34, 0.96), rgba(16, 25, 29, 0.92))
			!important;
		border-color: var(--line-strong) !important;
	}

	:root[data-theme-mode="dark"] .message.user .bubble {
		background: linear-gradient(160deg, rgba(104, 197, 186, 0.14), rgba(104, 197, 186, 0.04)) !important;
	}

	:root[data-theme-mode="dark"] .graph-node.running {
		background: rgba(212, 154, 85, 0.12) !important;
		border-color: rgba(212, 154, 85, 0.24) !important;
		color: #f2cf9c !important;
	}

	:root[data-theme-mode="dark"] .graph-node.finished {
		background: rgba(104, 197, 186, 0.14) !important;
		border-color: rgba(104, 197, 186, 0.24) !important;
		color: #9de2da !important;
	}

	:root[data-theme-mode="dark"] .graph-node.skipped {
		background: rgba(155, 178, 182, 0.08) !important;
		border-color: rgba(155, 178, 182, 0.16) !important;
		color: var(--muted) !important;
	}

	:root[data-theme-mode="dark"] .graph-node.failed {
		background: rgba(217, 135, 127, 0.12) !important;
		border-color: rgba(217, 135, 127, 0.22) !important;
		color: #efb2ab !important;
	}

	:root[data-theme-mode="dark"] :is(.status.started, .plan-chip.warn, .plan-footer-title, .latency-note) {
		color: #f2cf9c !important;
		border-color: rgba(212, 154, 85, 0.2) !important;
		background: rgba(212, 154, 85, 0.12) !important;
	}

	:root[data-theme-mode="dark"] :is(.status.finished, .badge.supports, .message.user .message-role) {
		background: rgba(104, 197, 186, 0.14) !important;
		color: #9de2da !important;
	}

	:root[data-theme-mode="dark"] :is(.status.failed, .thinking-log-item.error, .message.assistant .message-role) {
		background: rgba(217, 135, 127, 0.14) !important;
		color: #efb2ab !important;
	}

	:root[data-theme-mode="dark"] .tab.active {
		background: #edf6f6 !important;
		color: #0c1417 !important;
		box-shadow: 0 12px 24px rgba(0, 0, 0, 0.22) !important;
	}

	:root[data-theme-mode="dark"] :is(.suggestion-btn:hover, .ghost-btn:hover, .tab:hover) {
		background: var(--card-strong) !important;
	}

	:root[data-theme-mode="dark"] :is(.subtitle, .panel-note, .control span, .toggle span, .guide-item span, .session-label, .session-tip, .empty-state, .thinking-summary, .citation-hint, .composer-hint) {
		color: var(--muted) !important;
	}

	:root[data-theme-mode="dark"] :is(.control select, .answer-markdown, .answer-markdown p code, .answer-markdown li code, .answer-markdown blockquote code) {
		color: var(--text) !important;
	}

	:root[data-theme-mode="dark"] .answer-markdown blockquote {
		background: rgba(104, 197, 186, 0.08) !important;
		border-left-color: rgba(104, 197, 186, 0.36) !important;
		color: var(--muted) !important;
	}

	:root[data-theme-mode="dark"] .answer-markdown pre {
		background: #091215 !important;
		color: #edf6f6 !important;
	}

	:root[data-theme-mode="dark"] :is(.message-list::-webkit-scrollbar-thumb, .tab-panel.active::-webkit-scrollbar-thumb, .json-card::-webkit-scrollbar-thumb, .raw-stream::-webkit-scrollbar-thumb) {
		background: rgba(155, 178, 182, 0.22);
	}

	:root[data-theme-mode="dark"] .latency-note {
		color: #f0c58a;
		border-color: rgba(212, 154, 85, 0.18);
		background: rgba(212, 154, 85, 0.1);
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

function injectBeforeHeadEnd(html: string, payload: string) {
	if (html.includes("</head>")) {
		return html.replace("</head>", `${payload}</head>`);
	}
	return `${payload}${html}`;
}

const themeBridgeScript = String.raw`
<script data-aios-theme-bridge>
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

const reportThemeStyle = String.raw`
<style data-aios-theme-bridge>
	:root[data-theme-mode="dark"] {
		--bg: #0c1118;
		--paper: rgba(13, 18, 27, 0.92);
		--ink: rgba(240, 245, 255, 0.94);
		--muted: rgba(190, 202, 220, 0.72);
		--line: rgba(148, 163, 184, 0.18);
		--hero: linear-gradient(135deg, #2c2b4d 0%, #18324b 42%, #0f1726 100%);
		--shadow: 0 24px 68px rgba(0, 0, 0, 0.34);
	}

	:root[data-theme-mode="dark"] body {
		background:
			radial-gradient(circle at top right, rgba(86, 126, 255, 0.18), transparent 30%),
			radial-gradient(circle at bottom left, rgba(63, 181, 182, 0.12), transparent 28%),
			var(--bg) !important;
		color: var(--ink) !important;
	}

	:root[data-theme-mode="dark"] .hero {
		background: var(--hero) !important;
		box-shadow: var(--shadow) !important;
	}

	:root[data-theme-mode="dark"] .hero::after {
		background: rgba(255, 255, 255, 0.08);
	}

	:root[data-theme-mode="dark"] .eyebrow,
	:root[data-theme-mode="dark"] .stat,
	:root[data-theme-mode="dark"] .highlight-card,
	:root[data-theme-mode="dark"] .story-card {
		background: rgba(255, 255, 255, 0.06) !important;
		border-color: rgba(148, 163, 184, 0.2) !important;
		color: var(--ink) !important;
	}

	:root[data-theme-mode="dark"] .panel,
	:root[data-theme-mode="dark"] .section-block {
		background: var(--paper) !important;
		border-color: var(--line) !important;
		box-shadow: var(--shadow) !important;
	}

	:root[data-theme-mode="dark"] .highlight-card {
		background:
			linear-gradient(180deg, rgba(23, 30, 44, 0.92), rgba(17, 24, 39, 0.88))
			!important;
	}

	:root[data-theme-mode="dark"] .story-card {
		background: rgba(17, 24, 39, 0.84) !important;
	}

	:root[data-theme-mode="dark"] :is(
		h1,
		.panel h2,
		.highlight-card h3,
		.story-card h3,
		.section-header h2,
		.stat-value
	) {
		color: var(--ink) !important;
	}

	:root[data-theme-mode="dark"] :is(
		.subtitle,
		.overview,
		.stat-label,
		.highlight-category,
		.highlight-card p,
		.story-meta,
		.story-summary,
		.section-kicker,
		.section-count,
		.source-heading,
		.source-panel p,
		.footer-note
	) {
		color: var(--muted) !important;
	}

	:root[data-theme-mode="dark"] .story-content {
		color: rgba(226, 234, 246, 0.92) !important;
	}

	:root[data-theme-mode="dark"] .source-panel {
		border-top-color: rgba(148, 163, 184, 0.18) !important;
	}

	:root[data-theme-mode="dark"] .source-panel a {
		color: #dce9ff !important;
	}

	:root[data-theme-mode="dark"] a {
		color: #bfd7ff;
	}
</style>
`;

const dashboardThemeStyle = String.raw`
<style data-aios-theme-bridge>
	:root[data-theme-mode="dark"] {
		--bg: #0b1118;
		--panel: rgba(15, 19, 28, 0.88);
		--panel-strong: rgba(18, 24, 35, 0.96);
		--line: rgba(148, 163, 184, 0.18);
		--ink: rgba(240, 245, 255, 0.94);
		--muted: rgba(190, 202, 220, 0.72);
		--brand: #d4a46c;
		--brand-soft: rgba(212, 164, 108, 0.16);
		--teal: #7ad3da;
		--rose: #f39ab5;
		--danger: #ff947a;
		--success: #79d79f;
		--shadow: 0 24px 68px rgba(0, 0, 0, 0.34);
	}

	:root[data-theme-mode="dark"] body {
		background:
			radial-gradient(circle at top right, rgba(86, 126, 255, 0.18), transparent 28%),
			radial-gradient(circle at left center, rgba(63, 181, 182, 0.12), transparent 24%),
			var(--bg) !important;
		color: var(--ink) !important;
	}

	:root[data-theme-mode="dark"] .hero {
		background:
			linear-gradient(135deg, rgba(39, 30, 61, 0.96), rgba(17, 30, 43, 0.94)),
			var(--panel-strong) !important;
		border-color: rgba(148, 163, 184, 0.18) !important;
		box-shadow: var(--shadow) !important;
	}

	:root[data-theme-mode="dark"] .eyebrow,
	:root[data-theme-mode="dark"] .hero-panel,
	:root[data-theme-mode="dark"] .button-secondary {
		background: rgba(255, 255, 255, 0.06) !important;
		border-color: rgba(148, 163, 184, 0.18) !important;
		color: var(--ink) !important;
	}

	:root[data-theme-mode="dark"] .button-primary {
		box-shadow: 0 16px 32px rgba(0, 0, 0, 0.28) !important;
	}

	:root[data-theme-mode="dark"] :is(
		.metric-card,
		.panel,
		.mini-item,
		.stage-card,
		.bullet-card,
		.domain-card,
		.highlight-item,
		.run-item,
		.artifact-card
	) {
		background: var(--panel) !important;
		border-color: var(--line) !important;
		color: var(--ink) !important;
		box-shadow: none !important;
	}

	:root[data-theme-mode="dark"] .report-card {
		background:
			linear-gradient(180deg, rgba(40, 31, 47, 0.9), rgba(18, 24, 35, 0.96)),
			var(--panel-strong) !important;
		border-color: var(--line) !important;
		color: var(--ink) !important;
	}

	:root[data-theme-mode="dark"] .empty {
		background: rgba(255, 255, 255, 0.04) !important;
		border-color: rgba(148, 163, 184, 0.18) !important;
		color: var(--muted) !important;
	}

	:root[data-theme-mode="dark"] :is(.score-pill, .stage-order, .title-pill) {
		background: rgba(212, 164, 108, 0.14) !important;
		color: var(--ink) !important;
	}

	:root[data-theme-mode="dark"] .domain-strip {
		background: rgba(148, 163, 184, 0.14) !important;
	}

	:root[data-theme-mode="dark"] :is(
		.lede,
		.subtle,
		.metric-label,
		.metric-footnote,
		.bullet-card ul,
		.domain-desc,
		.domain-meta,
		.report-overview,
		.run-id,
		.artifact-files,
		.empty
	) {
		color: var(--muted) !important;
	}

	:root[data-theme-mode="dark"] a {
		color: #bfd7ff;
	}
</style>
`;

export function injectAiosIframeTheme(
	html: string,
	kind: "report" | "dashboard",
) {
	if (!html || html.includes("data-aios-theme-bridge")) {
		return html;
	}

	const themeStyle = kind === "report" ? reportThemeStyle : dashboardThemeStyle;
	return injectBeforeHeadEnd(html, `${themeStyle}${themeBridgeScript}`);
}

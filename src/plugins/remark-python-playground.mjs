import { visit } from "unist-util-visit";

export function remarkPythonPlayground() {
	return (tree) => {
		visit(tree, "code", (node) => {
			const normalizedLang = (node.lang || "").toLowerCase();
			if (!isPythonFence(normalizedLang)) {
				return;
			}

			node.type = "html";
			node.value = renderPythonCodeCard(
				node.value,
				parseMeta(node.meta, normalizedLang),
			);
		});
	};
}

function isPythonFence(lang = "") {
	return lang === "python" || lang === "python3" || lang === "py";
}

function parseMeta(meta = "", lang = "python") {
	const rawMeta = typeof meta === "string" ? meta : "";
	const titleMatch = rawMeta.match(/title\s*(?:=)?\s*"([^"]+)"/);
	const packagesMatch = rawMeta.match(/packages=([^\s"]+)/);

	return {
		title: normalizePythonCardTitle(titleMatch?.[1] || "", lang),
		packages: packagesMatch?.[1]
			? packagesMatch[1]
					.split(",")
					.map((item) => item.trim())
					.filter(Boolean)
			: [],
	};
}

function renderPythonCodeCard(source, options) {
	const lines = source.split("\n").length;
	const normalizedTitle = normalizePythonCardTitle(options.title);
	const hasCustomTitle = Boolean(normalizedTitle);

	return `<div class="python-code-card" data-python-code-card="true" data-python-title="${escapeAttribute(normalizedTitle)}" data-python-packages="${escapeAttribute(options.packages.join(","))}">
	<details class="python-code-card__details">
		<summary class="python-code-card__summary">
			<div class="python-code-card__summary-main">
				<span class="python-code-card__badge">Python3</span>
				${hasCustomTitle ? `<strong class="python-code-card__title">${escapeHtml(normalizedTitle)}</strong>` : `<span class="python-code-card__summary-label">点击展开代码</span>`}
			</div>
			<div class="python-code-card__summary-side">
				${options.packages.length > 0 ? `<span class="python-code-card__meta">${escapeHtml(options.packages.join(", "))}</span>` : ""}
				<span class="python-code-card__meta">${lines} lines</span>
				<span class="python-code-card__summary-toggle">展开代码</span>
			</div>
		</summary>
		<div class="python-code-card__body">
			<div class="python-code-card__utility">
				<button class="python-code-card__copy" type="button">复制</button>
			</div>
			<div class="python-code-card__surface">
				<code class="python-code-card__code" data-python-code-display="true"></code>
			</div>
		</div>
	</details>
	<textarea class="python-code-card__source" hidden>${escapeTextarea(source)}</textarea>
</div>`;
}

function escapeHtml(value) {
	return String(value)
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}

function escapeAttribute(value) {
	return escapeHtml(value).replaceAll("\n", "&#10;");
}

function escapeTextarea(value) {
	return String(value).replaceAll("</textarea", "&lt;/textarea");
}

function normalizePythonCardTitle(value, lang = "python") {
	const normalized = String(value || "").trim();
	if (!normalized) {
		return "";
	}

	const collapsed = normalized.toLowerCase().replace(/\s+/g, "");
	const languageLike = new Set(["python", "python3", "py"]);
	const langLike = String(lang || "")
		.toLowerCase()
		.replace(/\s+/g, "");

	if (languageLike.has(collapsed) || (langLike && collapsed === langLike)) {
		return "";
	}

	return normalized;
}

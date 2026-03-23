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
	const defaultTitle = "Python3";

	return {
		title: titleMatch?.[1] || defaultTitle,
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
	const packagesText =
		options.packages.length > 0
			? `packages: ${options.packages.join(", ")}`
			: "pure stdlib";

	return `<div class="python-code-card" data-python-code-card="true" data-python-title="${escapeAttribute(options.title)}" data-python-packages="${escapeAttribute(options.packages.join(","))}">
	<div class="python-code-card__toolbar">
		<div class="python-code-card__toolbar-meta">
			<span class="python-code-card__badge">Python3</span>
			<strong class="python-code-card__title">${escapeHtml(options.title)}</strong>
		</div>
		<div class="python-code-card__toolbar-side">
			<span class="python-code-card__meta">${escapeHtml(packagesText)}</span>
			<span class="python-code-card__meta">${lines} lines</span>
		</div>
	</div>
	<details class="python-code-card__details">
		<summary class="python-code-card__summary">
			<div class="python-code-card__summary-copy">
				<span class="python-code-card__summary-label">Frozen Editor</span>
				<span class="python-code-card__summary-note">默认折叠，点击展开查看完整代码</span>
			</div>
			<span class="python-code-card__summary-toggle">展开代码</span>
		</summary>
		<div class="python-code-card__body">
			<div class="python-code-card__utility">
				<button class="python-code-card__copy" type="button">复制代码</button>
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

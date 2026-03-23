import { visit } from "unist-util-visit";

export function remarkPythonPlayground() {
	return (tree) => {
		visit(tree, "code", (node) => {
			const normalizedLang = (node.lang || "").toLowerCase();
			if (normalizedLang !== "python") {
				return;
			}

			node.lang = normalizedLang;
			const options = parseMeta(node.meta);
			if (!options.runnable) {
				return;
			}

			node.type = "html";
			node.value = renderPythonCodeCard(node.value, options);
		});
	};
}

function parseMeta(meta = "") {
	const rawMeta = typeof meta === "string" ? meta : "";
	const tokens = rawMeta.split(/\s+/).filter(Boolean);
	const titleMatch = rawMeta.match(/title\s*(?:=)?\s*"([^"]+)"/);
	const packagesMatch = rawMeta.match(/packages=([^\s"]+)/);

	return {
		runnable: tokens.includes("run") || tokens.includes("runnable"),
		title: titleMatch?.[1] || "Python Playground",
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
			<span class="python-code-card__badge">Python Example</span>
			<strong class="python-code-card__title">${escapeHtml(options.title)}</strong>
		</div>
		<div class="python-code-card__toolbar-side">
			<span class="python-code-card__meta">${escapeHtml(packagesText)}</span>
			<span class="python-code-card__meta">${lines} lines</span>
		</div>
	</div>
	<details class="python-code-card__details" open>
		<summary class="python-code-card__summary">
			<div class="python-code-card__summary-copy">
				<span class="python-code-card__summary-label">Code Block</span>
				<span class="python-code-card__summary-note">折叠阅读或展开查看完整代码</span>
			</div>
			<span class="python-code-card__summary-toggle">折叠代码</span>
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

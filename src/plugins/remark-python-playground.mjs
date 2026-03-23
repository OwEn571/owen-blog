import { h } from "hastscript";
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

			node.type = "python-playground";
			node.data = {
				hName: "div",
				hProperties: {
					className: ["python-code-card"],
					"data-python-code-card": "true",
					"data-python-title": options.title,
					"data-python-packages": options.packages.join(","),
				},
				hChildren: [
					h("div.python-code-card__toolbar", [
						h("div.python-code-card__toolbar-meta", [
							h(
								"span.python-code-card__badge",
								"Python Example",
							),
							h("strong.python-code-card__title", options.title),
						]),
						h("div.python-code-card__toolbar-side", [
							options.packages.length > 0
								? h(
										"span.python-code-card__meta",
										`packages: ${options.packages.join(", ")}`,
									)
								: h(
										"span.python-code-card__meta",
										"pure stdlib",
									),
							h(
								"span.python-code-card__meta",
								`${node.value.split("\n").length} lines`,
							),
						]),
					]),
					h("details.python-code-card__details", { open: true }, [
						h("summary.python-code-card__summary", [
							h("div.python-code-card__summary-copy", [
								h(
									"span.python-code-card__summary-label",
									"Code Block",
								),
								h(
									"span.python-code-card__summary-note",
									"折叠阅读或展开查看完整代码",
								),
							]),
							h(
								"span.python-code-card__summary-toggle",
								"折叠代码",
							),
						]),
						h("div.python-code-card__body", [
							h("div.python-code-card__utility", [
								h(
									"button.python-code-card__copy",
									{ type: "button" },
									"复制代码",
								),
							]),
							h("div.python-code-card__surface", [
								h(
									"code.python-code-card__code",
									{ "data-python-code-display": "true" },
									"",
								),
							]),
						]),
					]),
					h(
						"textarea.python-code-card__source",
						{
							hidden: true,
						},
						node.value,
					),
				],
			};
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

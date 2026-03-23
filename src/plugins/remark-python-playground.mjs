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
					className: ["python-playground"],
					"data-python-playground": "true",
					"data-python-title": options.title,
					"data-python-packages": options.packages.join(","),
					"data-python-placeholder": options.placeholder,
				},
				hChildren: [
					h("div.python-playground__toolbar", [
						h("div.python-playground__toolbar-meta", [
							h(
								"span.python-playground__badge",
								"Runnable Python",
							),
							h("strong.python-playground__title", options.title),
						]),
						options.packages.length > 0
							? h(
									"span.python-playground__packages",
									`packages: ${options.packages.join(", ")}`,
								)
							: h(
									"span.python-playground__packages",
									"pure stdlib",
								),
					]),
					h("details.python-playground__details", [
						h("summary.python-playground__summary", [
							h("div.python-playground__summary-copy", [
								h(
									"span.python-playground__editor-label",
									"Practice Area",
								),
								h(
									"span.python-playground__editor-note",
									"点击展开后改代码，再运行查看结果",
								),
							]),
							h(
								"span.python-playground__summary-toggle",
								"展开练习区",
							),
						]),
						h("div.python-playground__editor-region", [
							h("div.python-playground__editor-shell", [
								h(
									"textarea.python-playground__code",
									{
										spellcheck: "false",
										"aria-label": `${options.title} Python editor`,
									},
									node.value,
								),
							]),
							h("div.python-playground__actions", [
								h(
									"span.python-playground__hint",
									"首次运行会加载浏览器内 Python 运行时",
								),
								h("div.python-playground__action-buttons", [
									h(
										"button.python-playground__reset-button",
										{
											type: "button",
										},
										"恢复答案",
									),
									h(
										"button.python-playground__run-button",
										{
											type: "button",
										},
										"运行代码",
									),
								]),
							]),
						]),
					]),
					h(
						"textarea.python-playground__answer",
						{
							hidden: true,
						},
						node.value,
					),
					h(
						"pre.python-playground__output",
						{
							"data-state": "idle",
							"aria-live": "polite",
						},
						options.placeholder,
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
		placeholder: "点击“运行代码”查看输出",
	};
}

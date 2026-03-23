import { visit } from "unist-util-visit";

const REPLACEMENTS = [
	[/[“”]/g, '"'],
	[/[‘’]/g, "'"],
];

export function remarkNormalizeSmartQuotes() {
	return (tree) => {
		visit(tree, "text", (node) => {
			if (typeof node.value !== "string") {
				return;
			}

			let nextValue = node.value;
			for (const [pattern, replacement] of REPLACEMENTS) {
				nextValue = nextValue.replace(pattern, replacement);
			}
			node.value = nextValue;
		});
	};
}

(function () {
	const PYODIDE_VERSION = "0.29.3";
	const PYODIDE_BASE_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
	const PYODIDE_SCRIPT_ID = "owen-python-lab-pyodide";
	const PANEL_POSITION_KEY = "owen-python-lab-position-v2";
	const DRAFT_KEY = "owen-python-lab-draft-v2";
	const INDENT = "    ";
	const labState = new WeakMap();
	const shared = {
		pyodide: null,
		pyodidePromise: null,
	};

	const PYTHON_KEYWORDS = new Set([
		"and",
		"as",
		"assert",
		"async",
		"await",
		"break",
		"class",
		"continue",
		"def",
		"del",
		"elif",
		"else",
		"except",
		"False",
		"finally",
		"for",
		"from",
		"global",
		"if",
		"import",
		"in",
		"is",
		"lambda",
		"None",
		"nonlocal",
		"not",
		"or",
		"pass",
		"raise",
		"return",
		"True",
		"try",
		"while",
		"with",
		"yield",
	]);

	const PYTHON_BUILTINS = new Set([
		"abs",
		"all",
		"any",
		"bool",
		"dict",
		"enumerate",
		"filter",
		"float",
		"input",
		"int",
		"len",
		"list",
		"map",
		"max",
		"min",
		"open",
		"print",
		"range",
		"reversed",
		"round",
		"set",
		"sorted",
		"str",
		"sum",
		"tuple",
		"type",
		"zip",
	]);

	const PYTHON_SUGGESTIONS = Array.from(
		new Set([
			...PYTHON_KEYWORDS,
			...PYTHON_BUILTINS,
			"append",
			"breakpoint",
			"clear",
			"copy",
			"count",
			"defaultdict",
			"deque",
			"extend",
			"items",
			"insert",
			"join",
			"keys",
			"lower",
			"pop",
			"read",
			"readline",
			"remove",
			"replace",
			"reverse",
			"self",
			"sort",
			"split",
			"strip",
			"sys",
			"update",
			"upper",
			"values",
			"write",
		]),
	).sort((left, right) => left.localeCompare(right, "en", { sensitivity: "base" }));

	const PYTHON_REFERENCE = {
		print: {
			detail: "builtin",
			documentation: "输出一个或多个对象到标准输出。",
			signatures: [
				{
					label: "print(*objects, sep=' ', end='\\n', file=None, flush=False)",
					parameters: ["*objects", "sep=' '", "end='\\n'", "file=None", "flush=False"],
				},
			],
		},
		range: {
			detail: "builtin",
			documentation: "生成整数序列，常用于 for 循环。",
			signatures: [
				{ label: "range(stop)", parameters: ["stop"] },
				{ label: "range(start, stop[, step])", parameters: ["start", "stop", "step"] },
			],
		},
		input: {
			detail: "builtin",
			documentation: "从标准输入读取一行文本并返回字符串。",
			signatures: [{ label: "input(prompt=None)", parameters: ["prompt=None"] }],
		},
		len: {
			detail: "builtin",
			documentation: "返回对象长度。",
			signatures: [{ label: "len(obj)", parameters: ["obj"] }],
		},
		list: {
			detail: "builtin",
			documentation: "构造列表对象。",
			signatures: [{ label: "list(iterable=())", parameters: ["iterable=()"] }],
		},
		dict: {
			detail: "builtin",
			documentation: "构造字典对象。",
			signatures: [{ label: "dict(**kwargs)", parameters: ["**kwargs"] }],
		},
		set: {
			detail: "builtin",
			documentation: "构造集合对象。",
			signatures: [{ label: "set(iterable=())", parameters: ["iterable=()"] }],
		},
		tuple: {
			detail: "builtin",
			documentation: "构造元组对象。",
			signatures: [{ label: "tuple(iterable=())", parameters: ["iterable=()"] }],
		},
		sum: {
			detail: "builtin",
			documentation: "对可迭代对象求和。",
			signatures: [{ label: "sum(iterable, /, start=0)", parameters: ["iterable", "start=0"] }],
		},
		sorted: {
			detail: "builtin",
			documentation: "返回新的已排序列表。",
			signatures: [
				{
					label: "sorted(iterable, /, *, key=None, reverse=False)",
					parameters: ["iterable", "key=None", "reverse=False"],
				},
			],
		},
		enumerate: {
			detail: "builtin",
			documentation: "遍历时同时获得索引和值。",
			signatures: [{ label: "enumerate(iterable, start=0)", parameters: ["iterable", "start=0"] }],
		},
		zip: {
			detail: "builtin",
			documentation: "把多个可迭代对象按位置打包。",
			signatures: [{ label: "zip(*iterables, strict=False)", parameters: ["*iterables", "strict=False"] }],
		},
		map: {
			detail: "builtin",
			documentation: "把函数映射到一个或多个可迭代对象。",
			signatures: [{ label: "map(function, iterable, ...)", parameters: ["function", "iterable", "..."] }],
		},
		filter: {
			detail: "builtin",
			documentation: "按条件过滤可迭代对象。",
			signatures: [{ label: "filter(function, iterable)", parameters: ["function", "iterable"] }],
		},
		defaultdict: {
			detail: "collections",
			documentation: "访问不存在的键时，会先用默认工厂函数创建默认值。",
			signatures: [
				{
					label: "defaultdict(default_factory=None, /, [...])",
					parameters: ["default_factory=None", "[...]"],
				},
			],
		},
		open: {
			detail: "builtin",
			documentation: "打开文件并返回文件对象。",
			signatures: [
				{
					label: "open(file, mode='r', encoding=None, ...)",
					parameters: ["file", "mode='r'", "encoding=None", "..."],
				},
			],
		},
		min: {
			detail: "builtin",
			documentation: "返回最小值。",
			signatures: [
				{ label: "min(iterable, *[, key, default])", parameters: ["iterable", "key", "default"] },
				{ label: "min(arg1, arg2, *args, key=None)", parameters: ["arg1", "arg2", "*args", "key=None"] },
			],
		},
		max: {
			detail: "builtin",
			documentation: "返回最大值。",
			signatures: [
				{ label: "max(iterable, *[, key, default])", parameters: ["iterable", "key", "default"] },
				{ label: "max(arg1, arg2, *args, key=None)", parameters: ["arg1", "arg2", "*args", "key=None"] },
			],
		},
	};

	function loadExternalScript(id, src, test) {
		if (typeof test === "function" && test()) {
			return Promise.resolve();
		}

		const existing = document.getElementById(id);
		if (existing instanceof HTMLScriptElement) {
			return new Promise((resolve, reject) => {
				if (typeof test === "function" && test()) {
					resolve();
					return;
				}
				existing.addEventListener("load", () => resolve(), { once: true });
				existing.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)), {
					once: true,
				});
			});
		}

		return new Promise((resolve, reject) => {
			const script = document.createElement("script");
			script.id = id;
			script.src = src;
			script.async = true;
			script.addEventListener("load", () => resolve(), { once: true });
			script.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)), {
				once: true,
			});
			document.body.appendChild(script);
		});
	}

	async function ensurePyodide() {
		if (shared.pyodide) {
			return shared.pyodide;
		}

		if (shared.pyodidePromise) {
			return shared.pyodidePromise;
		}

		shared.pyodidePromise = (async () => {
			await loadExternalScript(
				PYODIDE_SCRIPT_ID,
				`${PYODIDE_BASE_URL}pyodide.js`,
				() => typeof window.loadPyodide === "function",
			);

			const pyodide = await window.loadPyodide({
				indexURL: PYODIDE_BASE_URL,
			});
			shared.pyodide = pyodide;
			return pyodide;
		})().catch((error) => {
			shared.pyodidePromise = null;
			throw error;
		});

		return shared.pyodidePromise;
	}

	function setStatus(state, text) {
		state.status.textContent = text;
	}

	function setOutput(state, text, tone = "idle") {
		state.output.textContent = text;
		state.output.dataset.state = tone;
	}

	function getStoredPosition() {
		try {
			const raw = localStorage.getItem(PANEL_POSITION_KEY);
			if (!raw) {
				return null;
			}
			const parsed = JSON.parse(raw);
			if (typeof parsed?.left === "number" && typeof parsed?.top === "number") {
				return parsed;
			}
		} catch (error) {
			// ignore
		}
		return null;
	}

	function storePosition(position) {
		try {
			localStorage.setItem(PANEL_POSITION_KEY, JSON.stringify(position));
		} catch (error) {
			// ignore
		}
	}

	function clampPosition(panel, left, top) {
		const rect = panel.getBoundingClientRect();
		return {
			left: Math.min(Math.max(left, 16), Math.max(16, window.innerWidth - rect.width - 16)),
			top: Math.min(Math.max(top, 16), Math.max(16, window.innerHeight - rect.height - 16)),
		};
	}

	function applyPosition(state, position, mode = "custom") {
		state.panel.style.left = `${Math.round(position.left)}px`;
		state.panel.style.top = `${Math.round(position.top)}px`;
		state.panel.style.right = "auto";
		state.panel.style.bottom = "auto";
		state.panel.dataset.positionMode = mode;
	}

	function anchorPanel(state) {
		if (state.panel.dataset.positionMode === "custom") {
			return;
		}

		state.panel.style.left = "-9999px";
		state.panel.style.top = "-9999px";
		state.panel.hidden = false;
		const rect = state.toggle.getBoundingClientRect();
		const panelRect = state.panel.getBoundingClientRect();
		const gap = window.matchMedia("(max-width: 820px)").matches ? 10 : 14;
		let left = rect.left - panelRect.width - gap;
		if (left < 16) {
			left = Math.min(window.innerWidth - panelRect.width - 16, rect.right + gap);
		}
		let top = rect.bottom - panelRect.height + rect.height;
		top = Math.max(16, Math.min(top, window.innerHeight - panelRect.height - 16));
		applyPosition(state, { left, top }, "anchored");
	}

	function saveDraft(state) {
		try {
			localStorage.setItem(DRAFT_KEY, state.editor.value);
		} catch (error) {
			// ignore
		}
	}

	function restoreDraft(state) {
		try {
			const draft = localStorage.getItem(DRAFT_KEY);
			if (typeof draft === "string" && draft.length > 0) {
				state.editor.value = draft;
				return;
			}
		} catch (error) {
			// ignore
		}
		state.editor.value = state.source.value;
	}

	function focusEditor(state) {
		window.requestAnimationFrame(() => {
			state.editor.focus();
			const end = state.editor.value.length;
			state.editor.setSelectionRange(end, end);
		});
	}

	function escapeHtml(value) {
		return value
			.replaceAll("&", "&amp;")
			.replaceAll("<", "&lt;")
			.replaceAll(">", "&gt;");
	}

	function wrapToken(value, className) {
		const content = escapeHtml(value);
		return className ? `<span class="${className}">${content}</span>` : content;
	}

	function isIdentifierStart(char) {
		return /[A-Za-z_]/.test(char || "");
	}

	function isIdentifierPart(char) {
		return /[A-Za-z0-9_]/.test(char || "");
	}

	function getNextNonWhitespace(source, start) {
		for (let index = start; index < source.length; index += 1) {
			if (!/\s/.test(source[index])) {
				return source[index];
			}
		}
		return "";
	}

	function readStringLiteral(source, start) {
		const quote = source[start];
		const triple = source.slice(start, start + 3) === quote.repeat(3);
		let index = start + (triple ? 3 : 1);

		while (index < source.length) {
			if (triple) {
				if (source.slice(index, index + 3) === quote.repeat(3)) {
					index += 3;
					break;
				}
				index += 1;
				continue;
			}

			if (source[index] === "\\") {
				index += 2;
				continue;
			}

			if (source[index] === quote) {
				index += 1;
				break;
			}

			index += 1;
		}

		return {
			value: source.slice(start, index),
			end: index,
		};
	}

	function renderHighlightedPython(source) {
		const code = source || " ";
		let index = 0;
		let html = "";
		let pendingRole = "";

		while (index < code.length) {
			const char = code[index];

			if (char === "#") {
				let end = code.indexOf("\n", index);
				if (end === -1) {
					end = code.length;
				}
				html += wrapToken(code.slice(index, end), "python-lab-token-comment");
				index = end;
				pendingRole = "";
				continue;
			}

			if (char === "'" || char === '"') {
				const token = readStringLiteral(code, index);
				html += wrapToken(token.value, "python-lab-token-string");
				index = token.end;
				pendingRole = "";
				continue;
			}

			if (char === "@" && isIdentifierStart(code[index + 1])) {
				let end = index + 1;
				while (end < code.length && isIdentifierPart(code[end])) {
					end += 1;
				}
				html += wrapToken(code.slice(index, end), "python-lab-token-decorator");
				index = end;
				pendingRole = "";
				continue;
			}

			if (/\d/.test(char)) {
				let end = index + 1;
				while (end < code.length && /[\d._a-fA-Fboxj]/.test(code[end])) {
					end += 1;
				}
				html += wrapToken(code.slice(index, end), "python-lab-token-number");
				index = end;
				pendingRole = "";
				continue;
			}

			if (isIdentifierStart(char)) {
				let end = index + 1;
				while (end < code.length && isIdentifierPart(code[end])) {
					end += 1;
				}

				const token = code.slice(index, end);
				let className = "";

				if (pendingRole === "function") {
					className = "python-lab-token-function";
					pendingRole = "";
				} else if (pendingRole === "class") {
					className = "python-lab-token-class";
					pendingRole = "";
				} else if (PYTHON_KEYWORDS.has(token)) {
					className = "python-lab-token-keyword";
					if (token === "def") {
						pendingRole = "function";
					} else if (token === "class") {
						pendingRole = "class";
					}
				} else if (token === "True" || token === "False" || token === "None") {
					className = "python-lab-token-constant";
				} else if (PYTHON_BUILTINS.has(token)) {
					className = "python-lab-token-builtin";
				} else if (getNextNonWhitespace(code, end) === "(") {
					className = "python-lab-token-call";
				}

				html += wrapToken(token, className);
				index = end;
				continue;
			}

			if (!/\s/.test(char) && pendingRole) {
				pendingRole = "";
			}

			html += escapeHtml(char);
			index += 1;
		}

		return html;
	}

	function renderLineNumbers(state) {
		const total = Math.max(state.editor.value.split("\n").length, 1);
		const lines = Array.from({ length: total }, (_, index) => `${index + 1}`);
		state.gutter.textContent = lines.join("\n");
		state.gutter.scrollTop = state.editor.scrollTop;
	}

	function updateCurrentLineHighlight(state) {
		const style = window.getComputedStyle(state.editor);
		const lineHeight = Number.parseFloat(style.lineHeight || "24") || 24;
		const paddingTop = Number.parseFloat(style.paddingTop || "0") || 0;
		const before = state.editor.value.slice(0, state.editor.selectionStart);
		const lineIndex = before.split("\n").length - 1;
		const top = paddingTop + lineIndex * lineHeight - state.editor.scrollTop;
		state.lineHighlight.style.height = `${lineHeight}px`;
		state.lineHighlight.style.transform = `translateY(${Math.round(top)}px)`;
	}

	function syncViewport(state) {
		state.highlight.scrollTop = state.editor.scrollTop;
		state.highlight.scrollLeft = state.editor.scrollLeft;
		state.gutter.scrollTop = state.editor.scrollTop;
		updateCurrentLineHighlight(state);
	}

	function renderHighlight(state) {
		const value = state.editor.value;
		state.highlight.innerHTML = renderHighlightedPython(value);
		syncViewport(state);
	}

	function syncEditorChrome(state) {
		renderLineNumbers(state);
		renderHighlight(state);
		updateCurrentLineHighlight(state);
	}

	function createAutocompletePortal() {
		const portal = document.createElement("div");
		portal.className = "python-lab-autocomplete";
		portal.hidden = true;
		portal.setAttribute("role", "listbox");
		document.body.appendChild(portal);
		return portal;
	}

	function createSignaturePortal() {
		const portal = document.createElement("div");
		portal.className = "python-lab-signature";
		portal.hidden = true;
		document.body.appendChild(portal);
		return portal;
	}

	function createHoverPortal() {
		const portal = document.createElement("div");
		portal.className = "python-lab-hover";
		portal.hidden = true;
		document.body.appendChild(portal);
		return portal;
	}

	function hideAutocomplete(state) {
		state.autocomplete.hidden = true;
		state.autocomplete.innerHTML = "";
		state.suggestions = [];
		state.activeIndex = 0;
		state.context = null;
	}

	function hideSignatureHelp(state) {
		state.signature.hidden = true;
		state.signature.innerHTML = "";
		state.signatureContext = null;
	}

	function hideHoverInfo(state) {
		state.hover.hidden = true;
		state.hover.innerHTML = "";
		state.hoverContext = null;
	}

	function getCompletionContext(source, caretIndex) {
		let start = caretIndex;
		while (start > 0 && isIdentifierPart(source[start - 1])) {
			start -= 1;
		}

		const prefix = source.slice(start, caretIndex);
		if (!prefix || !isIdentifierStart(prefix[0])) {
			return null;
		}

		return {
			start,
			end: caretIndex,
			prefix,
		};
	}

	function collectSuggestions(prefix, source) {
		if (!prefix) {
			return [];
		}

		const normalizedPrefix = prefix.toLowerCase();
		const dynamicIdentifiers = Array.from(new Set(source.match(/[A-Za-z_][A-Za-z0-9_]*/g) || []));

		return Array.from(new Set([...dynamicIdentifiers, ...PYTHON_SUGGESTIONS]))
			.filter((item) => item.toLowerCase().startsWith(normalizedPrefix) && item !== prefix)
			.sort((left, right) => left.localeCompare(right, "en", { sensitivity: "base" }))
			.slice(0, 10);
	}

	function getSuggestionMeta(suggestion) {
		const reference = PYTHON_REFERENCE[suggestion];
		if (reference?.detail) {
			return reference.detail;
		}
		if (PYTHON_KEYWORDS.has(suggestion)) {
			return "keyword";
		}
		if (PYTHON_BUILTINS.has(suggestion)) {
			return "builtin";
		}
		return "symbol";
	}

	function findActiveCall(source) {
		let depth = 0;
		let argumentIndex = 0;

		for (let index = source.length - 1; index >= 0; index -= 1) {
			const char = source[index];
			if (char === ")") {
				depth += 1;
				continue;
			}
			if (char === "(") {
				if (depth === 0) {
					let end = index;
					let start = end;
					while (start > 0 && /[A-Za-z0-9_.]/.test(source[start - 1])) {
						start -= 1;
					}
					const name = source.slice(start, end).split(".").pop();
					return name
						? {
								name,
								argumentIndex,
						  }
						: null;
				}
				depth -= 1;
				continue;
			}
			if (char === "," && depth === 0) {
				argumentIndex += 1;
			}
		}

		return null;
	}

	function setActiveSuggestion(state, index) {
		if (state.suggestions.length === 0) {
			return;
		}

		state.activeIndex = (index + state.suggestions.length) % state.suggestions.length;
		state.autocomplete
			.querySelectorAll(".python-lab-autocomplete__item")
			.forEach((item, itemIndex) => {
				if (!(item instanceof HTMLElement)) {
					return;
				}
				const isActive = itemIndex === state.activeIndex;
				item.classList.toggle("is-active", isActive);
				item.setAttribute("aria-selected", isActive ? "true" : "false");
			});
	}

	function getTextareaCaretRect(textarea, position) {
		const rect = textarea.getBoundingClientRect();
		const style = window.getComputedStyle(textarea);
		const mirror = document.createElement("div");
		const marker = document.createElement("span");
		const properties = [
			"boxSizing",
			"width",
			"height",
			"fontFamily",
			"fontSize",
			"fontWeight",
			"fontStyle",
			"letterSpacing",
			"lineHeight",
			"textTransform",
			"textAlign",
			"textIndent",
			"paddingTop",
			"paddingRight",
			"paddingBottom",
			"paddingLeft",
			"borderTopWidth",
			"borderRightWidth",
			"borderBottomWidth",
			"borderLeftWidth",
			"tabSize",
		];

		mirror.style.position = "fixed";
		mirror.style.left = `${rect.left}px`;
		mirror.style.top = `${rect.top}px`;
		mirror.style.visibility = "hidden";
		mirror.style.pointerEvents = "none";
		mirror.style.whiteSpace = "pre";
		mirror.style.wordWrap = "normal";
		mirror.style.overflow = "auto";
		mirror.style.opacity = "0";

		properties.forEach((property) => {
			mirror.style[property] = style[property];
		});

		mirror.textContent = textarea.value.slice(0, position);
		marker.textContent = textarea.value.slice(position, position + 1) || "\u200b";
		mirror.appendChild(marker);
		document.body.appendChild(mirror);
		mirror.scrollTop = textarea.scrollTop;
		mirror.scrollLeft = textarea.scrollLeft;
		const markerRect = marker.getBoundingClientRect();
		mirror.remove();
		return markerRect;
	}

	function positionAutocomplete(state) {
		if (state.autocomplete.hidden) {
			return;
		}

		const caretRect = getTextareaCaretRect(state.editor, state.editor.selectionStart);
		const autocomplete = state.autocomplete;
		const margin = 12;
		autocomplete.style.left = `${Math.max(margin, caretRect.left)}px`;
		autocomplete.style.top = `${Math.min(window.innerHeight - margin, caretRect.bottom + 10)}px`;
		const panelRect = autocomplete.getBoundingClientRect();
		let left = caretRect.left;
		let top = caretRect.bottom + 10;

		if (left + panelRect.width > window.innerWidth - margin) {
			left = window.innerWidth - panelRect.width - margin;
		}
		if (top + panelRect.height > window.innerHeight - margin) {
			top = Math.max(margin, caretRect.top - panelRect.height - 10);
		}

		autocomplete.style.left = `${Math.max(margin, left)}px`;
		autocomplete.style.top = `${Math.max(margin, top)}px`;
	}

	function renderSignatureMarkup(reference, activeParameter) {
		const signature = reference.signatures?.[0];
		if (!signature) {
			return "";
		}

		let label = escapeHtml(signature.label);
		(signature.parameters || []).forEach((parameter, index) => {
			const escaped = escapeHtml(parameter);
			if (index === activeParameter) {
				label = label.replace(escaped, `<span class="is-active">${escaped}</span>`);
			}
		});

		return `
			<span class="python-lab-signature__title">${label}</span>
			<span class="python-lab-signature__meta">${escapeHtml(reference.detail || "builtin")}</span>
			<span class="python-lab-signature__doc">${escapeHtml(reference.documentation || "")}</span>
		`;
	}

	function positionSignatureHelp(state) {
		if (state.signature.hidden) {
			return;
		}

		const panel = state.signature;
		const caretRect = getTextareaCaretRect(state.editor, state.editor.selectionStart);
		const rect = panel.getBoundingClientRect();
		const margin = 12;
		let left = caretRect.left;
		let top = caretRect.top - rect.height - 12;

		if (left + rect.width > window.innerWidth - margin) {
			left = window.innerWidth - rect.width - margin;
		}

		if (top < margin) {
			top = Math.min(window.innerHeight - rect.height - margin, caretRect.bottom + 12);
		}

		panel.style.left = `${Math.max(margin, left)}px`;
		panel.style.top = `${Math.max(margin, top)}px`;
	}

	function getWordAtCursor(source, cursor) {
		let start = cursor;
		let end = cursor;
		while (start > 0 && isIdentifierPart(source[start - 1])) {
			start -= 1;
		}
		while (end < source.length && isIdentifierPart(source[end])) {
			end += 1;
		}
		const word = source.slice(start, end);
		if (!word || !isIdentifierStart(word[0])) {
			return null;
		}
		return { word, start, end };
	}

	function renderHoverMarkup(word, reference) {
		return `
			<span class="python-lab-hover__title">${escapeHtml(word)}</span>
			<span class="python-lab-hover__meta">${escapeHtml(reference.detail || "builtin")}</span>
			<span class="python-lab-hover__doc">${escapeHtml(reference.documentation || "")}</span>
		`;
	}

	function positionHoverInfo(state) {
		if (state.hover.hidden) {
			return;
		}

		const panel = state.hover;
		const caretRect = getTextareaCaretRect(state.editor, state.editor.selectionStart);
		const rect = panel.getBoundingClientRect();
		const margin = 12;
		let left = caretRect.left;
		let top = caretRect.top - rect.height - 14;

		if (left + rect.width > window.innerWidth - margin) {
			left = window.innerWidth - rect.width - margin;
		}
		if (top < margin) {
			top = Math.min(window.innerHeight - rect.height - margin, caretRect.bottom + 14);
		}

		panel.style.left = `${Math.max(margin, left)}px`;
		panel.style.top = `${Math.max(margin, top)}px`;
	}

	function updateSignatureHelp(state) {
		if (state.panel.hidden) {
			hideSignatureHelp(state);
			return;
		}

		const beforeCursor = state.editor.value.slice(0, state.editor.selectionStart);
		const activeCall = findActiveCall(beforeCursor);
		if (!activeCall) {
			hideSignatureHelp(state);
			return;
		}

		const reference = PYTHON_REFERENCE[activeCall.name];
		if (!reference?.signatures?.length) {
			hideSignatureHelp(state);
			return;
		}

		const activeParameter = Math.min(
			activeCall.argumentIndex,
			(reference.signatures[0].parameters?.length || 1) - 1,
		);
		state.signatureContext = {
			name: activeCall.name,
			activeParameter,
		};
		state.signature.innerHTML = renderSignatureMarkup(reference, activeParameter);
		state.signature.hidden = false;
		positionSignatureHelp(state);
	}

	function updateHoverInfo(state) {
		if (state.panel.hidden) {
			hideHoverInfo(state);
			return;
		}

		const selectionStart = state.editor.selectionStart;
		const selectionEnd = state.editor.selectionEnd;
		if (selectionStart !== selectionEnd) {
			hideHoverInfo(state);
			return;
		}

		const match = getWordAtCursor(state.editor.value, selectionStart);
		if (!match) {
			hideHoverInfo(state);
			return;
		}

		const reference = PYTHON_REFERENCE[match.word];
		if (!reference?.documentation) {
			hideHoverInfo(state);
			return;
		}

		state.hoverContext = match.word;
		state.hover.innerHTML = renderHoverMarkup(match.word, reference);
		state.hover.hidden = false;
		positionHoverInfo(state);
	}

	function applySuggestion(state, suggestion) {
		if (!state.context) {
			return;
		}

		const { start, end } = state.context;
		state.editor.setRangeText(suggestion, start, end, "end");
		saveDraft(state);
		syncEditorChrome(state);
		hideAutocomplete(state);
		updateSignatureHelp(state);
		updateHoverInfo(state);
		focusEditor(state);
	}

	function updateAutocomplete(state, options = {}) {
		const { force = false } = options;
		if (state.panel.hidden) {
			hideAutocomplete(state);
			return;
		}

		const start = state.editor.selectionStart;
		const end = state.editor.selectionEnd;
		if (start !== end) {
			hideAutocomplete(state);
			return;
		}

		const context = getCompletionContext(state.editor.value, start);
		if (!context || (!force && context.prefix.length < 1)) {
			hideAutocomplete(state);
			return;
		}

		const suggestions = collectSuggestions(context.prefix, state.editor.value);
		if (suggestions.length === 0) {
			hideAutocomplete(state);
			return;
		}

		state.context = context;
		state.suggestions = suggestions;
		state.activeIndex = 0;
		state.autocomplete.innerHTML = "";

		suggestions.forEach((suggestion, index) => {
			const button = document.createElement("button");
			const copy = document.createElement("span");
			const label = document.createElement("span");
			const doc = document.createElement("span");
			const meta = document.createElement("span");
			button.type = "button";
			button.className = "python-lab-autocomplete__item";
			button.setAttribute("role", "option");
			button.setAttribute("aria-selected", index === 0 ? "true" : "false");
			if (index === 0) {
				button.classList.add("is-active");
			}

			copy.className = "python-lab-autocomplete__copy";
			label.className = "python-lab-autocomplete__label";
			label.textContent = suggestion;
			doc.className = "python-lab-autocomplete__doc";
			doc.textContent = PYTHON_REFERENCE[suggestion]?.documentation || "来自当前代码与 Python 内置符号";
			meta.className = "python-lab-autocomplete__meta";
			meta.textContent = getSuggestionMeta(suggestion);

			copy.append(label, doc);
			button.append(copy, meta);
			button.addEventListener("mousedown", (event) => {
				event.preventDefault();
				applySuggestion(state, suggestion);
			});
			state.autocomplete.appendChild(button);
		});

		state.autocomplete.hidden = false;
		positionAutocomplete(state);
	}

	function insertAtCursor(textarea, text) {
		const start = textarea.selectionStart;
		const end = textarea.selectionEnd;
		textarea.setRangeText(text, start, end, "end");
	}

	function indentSelectedLines(textarea, outdent = false) {
		const start = textarea.selectionStart;
		const end = textarea.selectionEnd;
		const value = textarea.value;
		const lineStart = value.lastIndexOf("\n", start - 1) + 1;
		const lineEndIndex = value.indexOf("\n", end);
		const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex;
		const selected = value.slice(lineStart, lineEnd);
		const lines = selected.split("\n");
		const transformed = lines.map((line) => {
			if (!outdent) {
				return `${INDENT}${line}`;
			}
			if (line.startsWith(INDENT)) {
				return line.slice(INDENT.length);
			}
			return line.replace(/^\s{1,4}/, "");
		});
		const next = transformed.join("\n");
		textarea.setSelectionRange(lineStart, lineEnd);
		textarea.setRangeText(next, lineStart, lineEnd, "select");
		const selectionShift = outdent ? 0 : INDENT.length;
		const firstLineTrim = outdent ? Math.min(INDENT.length, lines[0].match(/^\s*/)?.[0]?.length || 0) : 0;
		textarea.setSelectionRange(
			start + selectionShift - firstLineTrim,
			end + transformed.length - selected.length,
		);
	}

	function insertPair(state, opening, closing) {
		const start = state.editor.selectionStart;
		const end = state.editor.selectionEnd;
		const selected = state.editor.value.slice(start, end);
		state.editor.setRangeText(`${opening}${selected}${closing}`, start, end, "end");
		if (start === end) {
			state.editor.setSelectionRange(start + 1, start + 1);
		}
		saveDraft(state);
		syncEditorChrome(state);
		updateSignatureHelp(state);
	}

	function handleEditorKeydown(state, event) {
		const hasAutocomplete = !state.autocomplete.hidden && state.suggestions.length > 0;

		if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
			event.preventDefault();
			void runCode(state);
			return;
		}

		if ((event.ctrlKey || event.metaKey) && event.code === "Space") {
			event.preventDefault();
			updateAutocomplete(state, { force: true });
			return;
		}

		if (event.key === "Escape") {
			if (hasAutocomplete) {
				event.preventDefault();
				hideAutocomplete(state);
				return;
			}
			closePanel(state);
			return;
		}

		if (event.key === "ArrowDown" && hasAutocomplete) {
			event.preventDefault();
			setActiveSuggestion(state, state.activeIndex + 1);
			return;
		}

		if (event.key === "ArrowUp" && hasAutocomplete) {
			event.preventDefault();
			setActiveSuggestion(state, state.activeIndex - 1);
			return;
		}

		if (event.key === "Tab") {
			event.preventDefault();
			if (hasAutocomplete) {
				applySuggestion(state, state.suggestions[state.activeIndex]);
				return;
			}
			if (event.shiftKey) {
				indentSelectedLines(state.editor, true);
			} else if (state.editor.selectionStart !== state.editor.selectionEnd) {
				indentSelectedLines(state.editor, false);
			} else {
				insertAtCursor(state.editor, INDENT);
			}
			saveDraft(state);
			syncEditorChrome(state);
			hideAutocomplete(state);
			updateSignatureHelp(state);
			return;
		}

		if (event.key === "Enter") {
			if (hasAutocomplete) {
				event.preventDefault();
				applySuggestion(state, state.suggestions[state.activeIndex]);
				return;
			}

			const start = state.editor.selectionStart;
			const value = state.editor.value;
			const lineStart = value.lastIndexOf("\n", start - 1) + 1;
			const currentLine = value.slice(lineStart, start);
			const indentMatch = currentLine.match(/^\s*/);
			const baseIndent = indentMatch ? indentMatch[0] : "";
			const extraIndent = /:\s*$/.test(currentLine) ? INDENT : "";
			event.preventDefault();
			insertAtCursor(state.editor, `\n${baseIndent}${extraIndent}`);
			saveDraft(state);
			syncEditorChrome(state);
			hideAutocomplete(state);
			updateSignatureHelp(state);
			return;
		}

		if (!event.metaKey && !event.ctrlKey && !event.altKey && event.key.length === 1) {
			if (event.key === "(") {
				event.preventDefault();
				insertPair(state, "(", ")");
				return;
			}
			if (event.key === "[") {
				event.preventDefault();
				insertPair(state, "[", "]");
				return;
			}
			if (event.key === "{") {
				event.preventDefault();
				insertPair(state, "{", "}");
				return;
			}
			if (event.key === '"' || event.key === "'") {
				event.preventDefault();
				insertPair(state, event.key, event.key);
			}
		}
	}

	async function runCode(state) {
		const code = state.editor.value;
		state.runButton.disabled = true;
		setStatus(state, "正在加载浏览器内 Python 运行时…");
		setOutput(state, "正在执行代码…", "loading");

		try {
			const pyodide = await ensurePyodide();
			if (
				typeof pyodide.loadPackagesFromImports === "function" &&
				/(^|\n)\s*(from\s+\S+\s+import|import\s+\S+)/.test(code)
			) {
				await pyodide.loadPackagesFromImports(code);
			}
			await pyodide.runPythonAsync(`
import io
import sys
import traceback

__owen_lab_stdout = io.StringIO()
__owen_lab_stderr = io.StringIO()
__owen_lab_traceback = ""
_owen_prev_stdout, _owen_prev_stderr = sys.stdout, sys.stderr

try:
    sys.stdout = __owen_lab_stdout
    sys.stderr = __owen_lab_stderr
    exec(${JSON.stringify(code)}, globals())
except Exception:
    __owen_lab_traceback = traceback.format_exc()
finally:
    sys.stdout = _owen_prev_stdout
    sys.stderr = _owen_prev_stderr
`);

			const stdoutBuffer = pyodide.globals.get("__owen_lab_stdout");
			const stderrBuffer = pyodide.globals.get("__owen_lab_stderr");
			const tracebackValue = pyodide.globals.get("__owen_lab_traceback");
			const stdout = stdoutBuffer.getvalue();
			const stderr = stderrBuffer.getvalue();
			const tracebackText =
				typeof tracebackValue === "string" ? tracebackValue : tracebackValue?.toString?.() || "";
			stdoutBuffer.destroy?.();
			stderrBuffer.destroy?.();
			tracebackValue.destroy?.();
			const finalOutput = [stdout, stderr, tracebackText].filter(Boolean).join("").trimEnd();

			if (tracebackText) {
				setOutput(state, finalOutput || tracebackText, "error");
				setStatus(state, "运行完成，但出现了 Python 错误。");
			} else {
				setOutput(state, finalOutput || "运行完成，没有标准输出。", "success");
				setStatus(state, "运行完成。");
			}
		} catch (error) {
			setOutput(state, error instanceof Error ? error.message : "Python 运行失败", "error");
			setStatus(state, "运行失败。");
		} finally {
			state.runButton.disabled = false;
		}
	}

	function bindDragging(state) {
		const handle = state.dragHandle;
		handle.addEventListener("pointerdown", (event) => {
			if (
				event.button !== 0 ||
				(event.target instanceof HTMLElement &&
					event.target.closest("button, input, textarea, select, a"))
			) {
				return;
			}

			event.preventDefault();
			event.stopPropagation();
			hideAutocomplete(state);
			hideSignatureHelp(state);
			hideHoverInfo(state);
			handle.setPointerCapture?.(event.pointerId);

			const rect = state.panel.getBoundingClientRect();
			const startLeft = rect.left;
			const startTop = rect.top;
			const startX = event.clientX;
			const startY = event.clientY;
			let draggingStarted = false;
			let frame = 0;
			let pending = null;

			state.panel.dataset.dragging = "armed";
			state.root.dataset.dragging = "armed";

			const flush = () => {
				frame = 0;
				if (!pending) {
					return;
				}
				applyPosition(state, pending);
				pending = null;
			};

			const onMove = (moveEvent) => {
				const deltaX = moveEvent.clientX - startX;
				const deltaY = moveEvent.clientY - startY;
				if (!draggingStarted && Math.hypot(deltaX, deltaY) < 4) {
					return;
				}
				if (!draggingStarted) {
					draggingStarted = true;
					state.panel.dataset.dragging = "true";
					state.root.dataset.dragging = "true";
				}
				pending = clampPosition(state.panel, startLeft + deltaX, startTop + deltaY);
				if (!frame) {
					frame = window.requestAnimationFrame(flush);
				}
			};

			const onUp = () => {
				if (frame) {
					window.cancelAnimationFrame(frame);
					frame = 0;
				}
				if (pending) {
					applyPosition(state, pending);
					storePosition(pending);
				} else if (draggingStarted) {
					const finalRect = state.panel.getBoundingClientRect();
					storePosition({ left: finalRect.left, top: finalRect.top });
				}

				delete state.panel.dataset.dragging;
				delete state.root.dataset.dragging;
				handle.releasePointerCapture?.(event.pointerId);
				window.removeEventListener("pointermove", onMove);
				window.removeEventListener("pointerup", onUp);
				window.removeEventListener("pointercancel", onUp);
			};

			window.addEventListener("pointermove", onMove);
			window.addEventListener("pointerup", onUp, { once: true });
			window.addEventListener("pointercancel", onUp, { once: true });
		});
	}

	function openPanel(state) {
		if (!state.panel.hidden) {
			return;
		}
		if (state.panel.dataset.positionMode !== "custom") {
			anchorPanel(state);
		} else {
			const stored = getStoredPosition();
			if (stored) {
				applyPosition(state, clampPosition(state.panel, stored.left, stored.top));
			}
		}
		state.panel.hidden = false;
		state.panel.dataset.state = "open";
		state.root.dataset.state = "open";
		state.toggle.setAttribute("aria-expanded", "true");
		state.panel.setAttribute("aria-hidden", "false");
		syncEditorChrome(state);
		updateSignatureHelp(state);
		updateHoverInfo(state);
		focusEditor(state);
	}

	function closePanel(state) {
		hideAutocomplete(state);
		hideSignatureHelp(state);
		hideHoverInfo(state);
		state.panel.hidden = true;
		state.panel.dataset.state = "closed";
		state.root.dataset.state = "closed";
		state.toggle.setAttribute("aria-expanded", "false");
		state.panel.setAttribute("aria-hidden", "true");
	}

	function togglePanel(state) {
		if (state.panel.hidden) {
			openPanel(state);
		} else {
			closePanel(state);
		}
	}

	function init(root) {
		if (!(root instanceof HTMLElement) || root.dataset.pythonLabReady === "true") {
			return;
		}

		const toggle = root.querySelector("[data-python-lab-toggle]");
		const panel = root.querySelector("[data-python-lab-panel]");
		const close = root.querySelector("[data-python-lab-close]");
		const editor = root.querySelector("[data-python-lab-editor]");
		const highlight = root.querySelector("[data-python-lab-highlight]");
		const lineHighlight = root.querySelector("[data-python-lab-line-highlight]");
		const runButton = root.querySelector("[data-python-lab-run]");
		const resetButton = root.querySelector("[data-python-lab-reset]");
		const clearButton = root.querySelector("[data-python-lab-clear]");
		const status = root.querySelector("[data-python-lab-status]");
		const output = root.querySelector("[data-python-lab-output]");
		const dragHandle = root.querySelector("[data-python-lab-drag-handle]");
		const source = root.querySelector("[data-python-lab-source]");
		const gutter = root.querySelector("[data-python-lab-gutter]");

		if (
			!(toggle instanceof HTMLButtonElement) ||
			!(panel instanceof HTMLElement) ||
			!(close instanceof HTMLButtonElement) ||
			!(editor instanceof HTMLTextAreaElement) ||
			!(highlight instanceof HTMLElement) ||
			!(lineHighlight instanceof HTMLElement) ||
			!(runButton instanceof HTMLButtonElement) ||
			!(resetButton instanceof HTMLButtonElement) ||
			!(clearButton instanceof HTMLButtonElement) ||
			!(status instanceof HTMLElement) ||
			!(output instanceof HTMLElement) ||
			!(dragHandle instanceof HTMLElement) ||
			!(source instanceof HTMLTextAreaElement) ||
			!(gutter instanceof HTMLElement)
		) {
			return;
		}

		if (panel.parentElement !== document.body) {
			document.body.appendChild(panel);
		}

		const state = {
			root,
			toggle,
			panel,
			close,
			editor,
			highlight,
			lineHighlight,
			runButton,
			resetButton,
			clearButton,
			status,
			output,
			dragHandle,
			source,
			gutter,
			autocomplete: createAutocompletePortal(),
			signature: createSignaturePortal(),
			hover: createHoverPortal(),
			suggestions: [],
			activeIndex: 0,
			context: null,
			signatureContext: null,
			hoverContext: null,
		};
		labState.set(root, state);

		restoreDraft(state);
		syncEditorChrome(state);
		setStatus(state, "轻量编辑器已就绪，支持高亮与轻量自动补全。");
		setOutput(state, "等待运行…", "idle");

		const stored = getStoredPosition();
		if (stored) {
			applyPosition(state, clampPosition(panel, stored.left, stored.top));
		}

		toggle.addEventListener("click", (event) => {
			event.preventDefault();
			event.stopPropagation();
			togglePanel(state);
		});

		close.addEventListener("click", (event) => {
			event.preventDefault();
			event.stopPropagation();
			closePanel(state);
		});

		close.addEventListener("pointerdown", (event) => {
			event.stopPropagation();
		});

		runButton.addEventListener("click", () => {
			void runCode(state);
		});

		resetButton.addEventListener("click", () => {
			state.editor.value = state.source.value;
			saveDraft(state);
			syncEditorChrome(state);
			hideAutocomplete(state);
			updateSignatureHelp(state);
			updateHoverInfo(state);
			setStatus(state, "示例代码已恢复。");
			focusEditor(state);
		});

		clearButton.addEventListener("click", () => {
			setOutput(state, "等待运行…", "idle");
			setStatus(state, "输出已清空。");
		});

		editor.addEventListener("input", () => {
			saveDraft(state);
			syncEditorChrome(state);
			updateAutocomplete(state);
			updateSignatureHelp(state);
			updateHoverInfo(state);
		});

		editor.addEventListener("scroll", () => {
			syncViewport(state);
			if (!state.autocomplete.hidden) {
				positionAutocomplete(state);
			}
			if (!state.signature.hidden) {
				positionSignatureHelp(state);
			}
			if (!state.hover.hidden) {
				positionHoverInfo(state);
			}
		});

		editor.addEventListener("keydown", (event) => {
			handleEditorKeydown(state, event);
		});

		editor.addEventListener("keyup", (event) => {
			if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(event.key)) {
				updateCurrentLineHighlight(state);
				updateAutocomplete(state);
				updateSignatureHelp(state);
				updateHoverInfo(state);
			}
		});

		editor.addEventListener("click", () => {
			updateCurrentLineHighlight(state);
			updateAutocomplete(state);
			updateSignatureHelp(state);
			updateHoverInfo(state);
		});

		editor.addEventListener("focus", () => {
			syncEditorChrome(state);
			updateSignatureHelp(state);
			updateHoverInfo(state);
		});

		document.addEventListener(
			"mousedown",
			(event) => {
				if (
					panel.hidden ||
					!(event.target instanceof Node) ||
					root.contains(event.target) ||
					panel.contains(event.target) ||
					state.autocomplete.contains(event.target) ||
					state.signature.contains(event.target) ||
					state.hover.contains(event.target)
				) {
					return;
				}
				closePanel(state);
			},
			true,
		);

		window.addEventListener(
			"resize",
			() => {
				if (panel.hidden) {
					return;
				}
				const rect = panel.getBoundingClientRect();
				const next = clampPosition(panel, rect.left, rect.top);
				applyPosition(state, next, panel.dataset.positionMode === "custom" ? "custom" : "anchored");
				if (panel.dataset.positionMode === "custom") {
					storePosition(next);
				}
				if (!state.autocomplete.hidden) {
					positionAutocomplete(state);
				}
				if (!state.signature.hidden) {
					positionSignatureHelp(state);
				}
				if (!state.hover.hidden) {
					positionHoverInfo(state);
				}
			},
			{ passive: true },
		);

		window.addEventListener(
			"scroll",
			() => {
				if (!state.autocomplete.hidden) {
					positionAutocomplete(state);
				}
				if (!state.signature.hidden) {
					positionSignatureHelp(state);
				}
				if (!state.hover.hidden) {
					positionHoverInfo(state);
				}
			},
			{ passive: true },
		);

		bindDragging(state);
		root.dataset.pythonLabReady = "true";
	}

	window.__owenInitPythonLab = init;

	const autoInit = () => {
		document.querySelectorAll("[data-python-lab]").forEach((element) => init(element));
	};

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", autoInit, { once: true });
	} else {
		autoInit();
	}
})();

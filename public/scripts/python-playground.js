(function () {
	const PYODIDE_VERSION = "0.29.3";
	const PYODIDE_BASE_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
	const SCRIPT_ID = "mizuki-pyodide-runtime";
	const MONACO_VERSION = "0.52.2";
	const MONACO_BASE_URL = `https://cdn.jsdelivr.net/npm/monaco-editor@${MONACO_VERSION}/min`;
	const MONACO_LOADER_ID = "mizuki-monaco-loader";
	const PYTHON_LAB_POSITION_KEY = "owen-python-lab-position";
	const INDENT = "    ";
	const editorStateMap = new WeakMap();
	const pythonLabStateMap = new WeakMap();

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
			"items",
			"keys",
			"lower",
			"pop",
			"read",
			"readline",
			"self",
			"sort",
			"split",
			"strip",
			"sys",
			"values",
			"write",
		]),
	).sort((left, right) =>
		left.localeCompare(right, "en", { sensitivity: "base" }),
	);

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
		def: {
			detail: "keyword",
			documentation: "定义函数。",
		},
		class: {
			detail: "keyword",
			documentation: "定义类。",
		},
		for: {
			detail: "keyword",
			documentation: "遍历可迭代对象。",
		},
		if: {
			detail: "keyword",
			documentation: "条件判断分支。",
		},
		while: {
			detail: "keyword",
			documentation: "当条件为真时循环执行。",
		},
		try: {
			detail: "keyword",
			documentation: "异常捕获入口。",
		},
		except: {
			detail: "keyword",
			documentation: "处理匹配到的异常。",
		},
		with: {
			detail: "keyword",
			documentation: "上下文管理器语法。",
		},
		import: {
			detail: "keyword",
			documentation: "导入模块或对象。",
		},
		return: {
			detail: "keyword",
			documentation: "从函数返回值。",
		},
	};

	function getState() {
		if (!window.__mizukiPythonPlayground) {
			window.__mizukiPythonPlayground = {
				pyodidePromise: null,
				executionQueue: Promise.resolve(),
			};
		}
		return window.__mizukiPythonPlayground;
	}

	function loadRuntimeScript() {
		if (window.loadPyodide) {
			return Promise.resolve();
		}

		const existing = document.getElementById(SCRIPT_ID);
		if (existing) {
			return new Promise((resolve, reject) => {
				existing.addEventListener("load", () => resolve(), {
					once: true,
				});
				existing.addEventListener(
					"error",
					() => reject(new Error("Pyodide runtime load failed")),
					{ once: true },
				);
			});
		}

		return new Promise((resolve, reject) => {
			const script = document.createElement("script");
			script.id = SCRIPT_ID;
			script.src = `${PYODIDE_BASE_URL}pyodide.js`;
			script.async = true;
			script.onload = () => resolve();
			script.onerror = () =>
				reject(new Error("Pyodide runtime load failed"));
			document.head.appendChild(script);
		});
	}

	function loadMonacoLoader() {
		if (window.monaco?.editor) {
			return Promise.resolve();
		}

		const existing = document.getElementById(MONACO_LOADER_ID);
		if (existing) {
			return new Promise((resolve, reject) => {
				existing.addEventListener("load", () => resolve(), {
					once: true,
				});
				existing.addEventListener(
					"error",
					() => reject(new Error("Monaco loader failed to load")),
					{ once: true },
				);
			});
		}

		return new Promise((resolve, reject) => {
			const script = document.createElement("script");
			script.id = MONACO_LOADER_ID;
			script.src = `${MONACO_BASE_URL}/vs/loader.js`;
			script.async = true;
			script.onload = () => resolve();
			script.onerror = () =>
				reject(new Error("Monaco loader failed to load"));
			document.head.appendChild(script);
		});
	}

	async function ensurePyodide() {
		const state = getState();
		if (!state.pyodidePromise) {
			state.pyodidePromise = (async () => {
				await loadRuntimeScript();
				const pyodide = await window.loadPyodide({
					indexURL: PYODIDE_BASE_URL,
				});
				state.pyodideLoaded = true;
				return pyodide;
			})();
		}

		return state.pyodidePromise;
	}

	function getMonacoThemeName() {
		return document.documentElement.classList.contains("dark")
			? "mizuki-python-dark"
			: "mizuki-python-light";
	}

	function ensureMonacoTheme(monaco) {
		const state = getState();
		if (!state.monacoThemeDefined) {
			monaco.editor.defineTheme("mizuki-python-light", {
				base: "vs",
				inherit: true,
				rules: [],
				colors: {
					"editor.background": "#00000000",
					"editor.lineHighlightBackground": "#76 9cff12".replaceAll(" ", ""),
					"editor.selectionBackground": "#769cff2a",
					"editor.inactiveSelectionBackground": "#769cff16",
				},
			});

			monaco.editor.defineTheme("mizuki-python-dark", {
				base: "vs-dark",
				inherit: true,
				rules: [],
				colors: {
					"editor.background": "#00000000",
					"editor.lineHighlightBackground": "#769cff16",
					"editor.selectionBackground": "#769cff30",
					"editor.inactiveSelectionBackground": "#769cff1c",
				},
			});

			state.monacoThemeDefined = true;
		}

		monaco.editor.setTheme(getMonacoThemeName());

		if (!state.monacoThemeObserver) {
			const observer = new MutationObserver(() => {
				monaco.editor.setTheme(getMonacoThemeName());
			});
			observer.observe(document.documentElement, {
				attributes: true,
				attributeFilter: ["class"],
			});
			state.monacoThemeObserver = observer;
		}
	}

	function ensureMonacoCompletion(monaco) {
		const state = getState();
		if (state.monacoCompletionRegistered) {
			return;
		}

		monaco.languages.registerCompletionItemProvider("python", {
			triggerCharacters: ["_", "."],
			provideCompletionItems(model, position) {
				const word = model.getWordUntilPosition(position);
				const range = {
					startLineNumber: position.lineNumber,
					endLineNumber: position.lineNumber,
					startColumn: word.startColumn,
					endColumn: word.endColumn,
				};
				const prefix = word.word || "";
				const identifiers = Array.from(
					new Set(model.getValue().match(/[A-Za-z_][A-Za-z0-9_]*/g) || []),
				);
				const suggestions = Array.from(
					new Set([...identifiers, ...PYTHON_SUGGESTIONS]),
				)
					.filter((item) =>
						prefix
							? item.toLowerCase().startsWith(prefix.toLowerCase()) &&
								item !== prefix
							: true,
					)
					.slice(0, 24)
					.map((item) => {
						let kind = monaco.languages.CompletionItemKind.Variable;
						if (PYTHON_KEYWORDS.has(item)) {
							kind = monaco.languages.CompletionItemKind.Keyword;
						} else if (PYTHON_BUILTINS.has(item)) {
							kind = monaco.languages.CompletionItemKind.Function;
						}

						return {
							label: item,
							kind,
							insertText: item,
							range,
							detail: getSuggestionMeta(item),
						};
					});

				return { suggestions };
			},
		});

		state.monacoCompletionRegistered = true;
	}

	function ensureMonacoHover(monaco) {
		const state = getState();
		if (state.monacoHoverRegistered) {
			return;
		}

		monaco.languages.registerHoverProvider("python", {
			provideHover(model, position) {
				const word = model.getWordAtPosition(position);
				if (!word) {
					return null;
				}

				const reference = PYTHON_REFERENCE[word.word];
				if (!reference) {
					return null;
				}

				return {
					range: new monaco.Range(
						position.lineNumber,
						word.startColumn,
						position.lineNumber,
						word.endColumn,
					),
					contents: [
						{ value: `**${word.word}**` },
						{ value: `${reference.detail}` },
						{ value: reference.documentation },
					],
				};
			},
		});

		state.monacoHoverRegistered = true;
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

	function ensureMonacoSignatureHelp(monaco) {
		const state = getState();
		if (state.monacoSignatureRegistered) {
			return;
		}

		monaco.languages.registerSignatureHelpProvider("python", {
			signatureHelpTriggerCharacters: ["(", ","],
			signatureHelpRetriggerCharacters: [","],
			provideSignatureHelp(model, position) {
				const beforeCursor = model.getValueInRange({
					startLineNumber: 1,
					startColumn: 1,
					endLineNumber: position.lineNumber,
					endColumn: position.column,
				});
				const activeCall = findActiveCall(beforeCursor);
				if (!activeCall) {
					return null;
				}

				const reference = PYTHON_REFERENCE[activeCall.name];
				if (!reference?.signatures?.length) {
					return null;
				}

				return {
					value: {
						activeSignature: 0,
						activeParameter: Math.min(
							activeCall.argumentIndex,
							(reference.signatures[0].parameters?.length || 1) - 1,
						),
						signatures: reference.signatures.map((signature) => ({
							label: signature.label,
							documentation: reference.documentation,
							parameters: (signature.parameters || []).map((parameter) => ({
								label: parameter,
							})),
						})),
					},
					dispose() {},
				};
			},
		});

		state.monacoSignatureRegistered = true;
	}

	function shouldRunLiveValidation(root) {
		const editorState = getEditorState(root);
		if (!editorState?.monacoEditor) {
			return false;
		}

		const state = getState();
		if (!state.pyodidePromise) {
			return false;
		}

		return editorState.monacoEditor.getValue().length <= 16000;
	}

	async function ensureMonaco() {
		const state = getState();
		if (window.monaco?.editor) {
			return window.monaco;
		}

		if (!state.monacoPromise) {
			state.monacoPromise = (async () => {
				await loadMonacoLoader();

				if (window.monaco?.editor) {
					return window.monaco;
				}

				const amdRequire = window.require;
				if (typeof amdRequire !== "function") {
					throw new Error("Monaco AMD loader is unavailable");
				}

				amdRequire.config({
					paths: {
						vs: `${MONACO_BASE_URL}/vs`,
					},
				});

				return new Promise((resolve, reject) => {
					amdRequire(
						["vs/editor/editor.main"],
						() => resolve(window.monaco),
						(error) =>
							reject(
								error instanceof Error
									? error
									: new Error("Monaco failed to initialize"),
							),
					);
				});
			})();
		}

		return state.monacoPromise;
	}

	function setMonacoMarkers(monaco, model, markers) {
		if (!model) {
			return;
		}
		monaco.editor.setModelMarkers(model, "mizuki-python", markers);
	}

	async function validateMonacoSyntax(root) {
		const editorState = getEditorState(root);
		if (!editorState?.monacoEditor) {
			return;
		}

		const monaco = window.monaco;
		const model = editorState.monacoEditor.getModel();
		if (!monaco || !model) {
			return;
		}

		const requestId = (editorState.monacoValidationRequestId || 0) + 1;
		editorState.monacoValidationRequestId = requestId;
		const source = editorState.monacoEditor.getValue();

		try {
			const result = await queueExecution(async () => {
				const pyodide = await ensurePyodide();
				await pyodide.runPythonAsync(`
import json

__mizuki_compile_error = ""
try:
    compile(${JSON.stringify(source)}, "<mizuki-editor>", "exec")
except SyntaxError as exc:
    __mizuki_compile_error = json.dumps({
        "message": exc.msg,
        "line": exc.lineno or 1,
        "column": exc.offset or 1,
        "endLine": getattr(exc, "end_lineno", None) or exc.lineno or 1,
        "endColumn": getattr(exc, "end_offset", None) or (exc.offset or 1) + 1,
    })
`);
				return readGlobal(pyodide, "__mizuki_compile_error");
			});

			if (editorState.monacoValidationRequestId !== requestId) {
				return;
			}

			if (!result) {
				setMonacoMarkers(monaco, model, []);
				return;
			}

			const error = JSON.parse(result);
			setMonacoMarkers(monaco, model, [
				{
					startLineNumber: error.line || 1,
					startColumn: Math.max(error.column || 1, 1),
					endLineNumber: error.endLine || error.line || 1,
					endColumn: Math.max(error.endColumn || (error.column || 1) + 1, 1),
					message: error.message || "Python 语法错误",
					severity: monaco.MarkerSeverity.Error,
				},
			]);
		} catch (error) {
			if (editorState.monacoValidationRequestId === requestId) {
				setMonacoMarkers(monaco, model, []);
			}
		}
	}

	function scheduleMonacoValidation(root) {
		const editorState = getEditorState(root);
		if (!editorState?.monacoEditor || !shouldRunLiveValidation(root)) {
			return;
		}

		window.clearTimeout(editorState.monacoValidationTimer);
		editorState.monacoValidationTimer = window.setTimeout(() => {
			void validateMonacoSyntax(root);
		}, 1400);
	}

	function scheduleMonacoLayout(root) {
		const editorState = getEditorState(root);
		if (!editorState?.monacoEditor) {
			return;
		}

		window.clearTimeout(editorState.monacoLayoutTimer);
		editorState.monacoLayoutTimer = window.setTimeout(() => {
			layoutMonacoEditor(root);
		}, 16);
	}

	function queueExecution(task) {
		const state = getState();
		const nextRun = state.executionQueue.catch(() => undefined).then(task);
		state.executionQueue = nextRun.catch(() => undefined);
		return nextRun;
	}

	function readGlobal(pyodide, name) {
		const value = pyodide.globals.get(name);
		try {
			if (typeof value === "string") {
				return value;
			}
			if (value == null) {
				return "";
			}
			return String(value);
		} finally {
			if (value && typeof value.destroy === "function") {
				value.destroy();
			}
		}
	}

	function escapeHtml(value) {
		return value
			.replaceAll("&", "&amp;")
			.replaceAll("<", "&lt;")
			.replaceAll(">", "&gt;");
	}

	function wrapToken(value, className) {
		const content = escapeHtml(value);
		return className
			? `<span class="${className}">${content}</span>`
			: content;
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
		if (!source) {
			return "\n";
		}

		let index = 0;
		let html = "";
		let pendingRole = "";

		while (index < source.length) {
			const char = source[index];

			if (char === "#") {
				let end = source.indexOf("\n", index);
				if (end === -1) {
					end = source.length;
				}
				html += wrapToken(
					source.slice(index, end),
					"python-playground__token-comment",
				);
				index = end;
				pendingRole = "";
				continue;
			}

			if (char === "'" || char === '"') {
				const token = readStringLiteral(source, index);
				html += wrapToken(
					token.value,
					"python-playground__token-string",
				);
				index = token.end;
				pendingRole = "";
				continue;
			}

			if (char === "@" && isIdentifierStart(source[index + 1])) {
				let end = index + 1;
				while (end < source.length && isIdentifierPart(source[end])) {
					end += 1;
				}
				html += wrapToken(
					source.slice(index, end),
					"python-playground__token-decorator",
				);
				index = end;
				pendingRole = "";
				continue;
			}

			if (/\d/.test(char)) {
				let end = index + 1;
				while (
					end < source.length &&
					/[\d._a-fA-Fboxj]/.test(source[end])
				) {
					end += 1;
				}
				html += wrapToken(
					source.slice(index, end),
					"python-playground__token-number",
				);
				index = end;
				pendingRole = "";
				continue;
			}

			if (isIdentifierStart(char)) {
				let end = index + 1;
				while (end < source.length && isIdentifierPart(source[end])) {
					end += 1;
				}

				const token = source.slice(index, end);
				let className = "";

				if (pendingRole === "function") {
					className = "python-playground__token-function";
					pendingRole = "";
				} else if (pendingRole === "class") {
					className = "python-playground__token-class";
					pendingRole = "";
				} else if (PYTHON_KEYWORDS.has(token)) {
					className = "python-playground__token-keyword";
					if (token === "def") {
						pendingRole = "function";
					} else if (token === "class") {
						pendingRole = "class";
					}
				} else if (token === "True" || token === "False" || token === "None") {
					className = "python-playground__token-constant";
				} else if (PYTHON_BUILTINS.has(token)) {
					className = "python-playground__token-builtin";
				} else if (getNextNonWhitespace(source, end) === "(") {
					className = "python-playground__token-call";
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

	function setOutput(output, message, state) {
		output.textContent = message;
		output.dataset.state = state;
	}

	function renderCodeCardMarkup(source) {
		return renderHighlightedPython(source)
			.split("\n")
			.map(
				(line, index) => `
					<span class="python-code-card__line">
						<span class="python-code-card__line-no">${index + 1}</span>
						<span class="python-code-card__line-content">${line || " "}</span>
					</span>
				`,
			)
			.join("");
	}

	function createElement(tagName, className, textContent) {
		const element = document.createElement(tagName);
		if (className) {
			element.className = className;
		}
		if (typeof textContent === "string") {
			element.textContent = textContent;
		}
		return element;
	}

	function normalizePythonCardTitle(value) {
		const normalized = String(value || "").trim();
		if (!normalized) {
			return "";
		}

		const collapsed = normalized.toLowerCase().replace(/\s+/g, "");
		if (collapsed === "python" || collapsed === "python3" || collapsed === "py") {
			return "";
		}

		return normalized;
	}

function buildPythonCodeCardElement({ title, packages, source }) {
	const normalizedTitle = normalizePythonCardTitle(title);
	const hasCustomTitle = Boolean(normalizedTitle);
	const root = createElement("div", "python-code-card");
	root.dataset.pythonCodeCard = "true";
	root.dataset.pythonTitle = normalizedTitle;
	root.dataset.pythonPackages = packages.join(",");

	const toolbar = createElement("div", "python-code-card__toolbar");
	const toolbarMeta = createElement("div", "python-code-card__toolbar-meta");
	const badge = createElement("span", "python-code-card__badge", "Python3");
	const toolbarSide = createElement("div", "python-code-card__toolbar-side");
	const packagesElement = createElement(
		"span",
		"python-code-card__meta",
		packages.join(", "),
	);
	const linesElement = createElement(
		"span",
		"python-code-card__meta",
		`${source.split("\n").length} lines`,
	);

	const details = createElement("details", "python-code-card__details");
	details.open = false;

	const summary = createElement("summary", "python-code-card__summary");
	const summaryCopy = createElement("div", "python-code-card__summary-copy");
	const summaryLabel = createElement(
		"span",
		"python-code-card__summary-label",
		hasCustomTitle ? normalizedTitle : "点击展开代码",
	);
	const summaryNote = createElement(
		"span",
		"python-code-card__summary-note",
		packages.length > 0
			? `${packages.join(", ")} · ${source.split("\n").length} lines`
			: `${source.split("\n").length} lines · frozen view`,
	);
	const summaryToggle = createElement(
		"span",
		"python-code-card__summary-toggle",
		"展开",
	);

	const body = createElement("div", "python-code-card__body");
	const utility = createElement("div", "python-code-card__utility");
	const copyButton = createElement(
		"button",
		"python-code-card__copy",
		"复制代码",
	);
	copyButton.type = "button";
	const surface = createElement("div", "python-code-card__surface");
	const surfaceBar = createElement("div", "python-code-card__surface-bar");
	const surfaceDots = createElement("div", "python-code-card__surface-dots");
	surfaceDots.setAttribute("aria-hidden", "true");
	surfaceDots.append(
		createElement("span", "", ""),
		createElement("span", "", ""),
		createElement("span", "", ""),
	);
	const surfaceName = createElement(
		"span",
		"python-code-card__surface-name",
		"Python3",
	);
	const surfaceState = createElement(
		"span",
		"python-code-card__surface-state",
		"Readonly",
	);
	const code = createElement("code", "python-code-card__code");
	code.setAttribute("data-python-code-display", "true");
	const sourceField = document.createElement("textarea");
	sourceField.className = "python-code-card__source";
	sourceField.hidden = true;
	sourceField.value = source;

	if (hasCustomTitle) {
		const titleElement = createElement(
			"strong",
			"python-code-card__title",
			normalizedTitle,
		);
		toolbarMeta.append(badge, titleElement);
	} else {
		toolbarMeta.append(badge);
	}
	if (packages.length > 0) {
		toolbarSide.append(packagesElement);
	}
	toolbarSide.append(linesElement);
	toolbar.append(toolbarMeta, toolbarSide);

	summaryCopy.append(summaryLabel, summaryNote);
	summary.append(summaryCopy, summaryToggle);
	details.append(summary);

	utility.append(copyButton);
	surfaceBar.append(surfaceDots, surfaceName, surfaceState);
	surface.append(surfaceBar, code);
	body.append(utility, surface);
	details.append(body);

	root.append(toolbar, details, sourceField);
	return root;
}

	function normalizeLegacyPlayground(root) {
		if (!(root instanceof HTMLElement)) {
			return null;
		}

		const sourceField = root.querySelector(
			".python-playground__answer, .python-playground__code",
		);
		if (!(sourceField instanceof HTMLTextAreaElement)) {
			return null;
		}

		const title =
			root.dataset.pythonTitle ||
			root.querySelector(".python-playground__title")?.textContent?.trim() ||
			"";
		const packages = (root.dataset.pythonPackages || "")
			.split(",")
			.map((item) => item.trim())
			.filter(Boolean);
		const next = buildPythonCodeCardElement({
			title,
			packages,
			source: sourceField.value,
		});

		root.replaceWith(next);
		return next;
	}

	function syncCodeCardToggle(root) {
		const details = root.querySelector(".python-code-card__details");
		const label = root.querySelector(".python-code-card__summary-toggle");
		if (!(details instanceof HTMLDetailsElement) || !(label instanceof HTMLElement)) {
			return;
		}

		label.textContent = details.open ? "收起" : "展开";
	}

	function bindPythonCodeCard(root) {
		if (!(root instanceof HTMLElement) || root.dataset.pythonCodeCardBound === "true") {
			return;
		}

		const source = root.querySelector(".python-code-card__source");
		const display = root.querySelector("[data-python-code-display]");
		const details = root.querySelector(".python-code-card__details");
		const copyButton = root.querySelector(".python-code-card__copy");

		if (
			!(source instanceof HTMLTextAreaElement) ||
			!(display instanceof HTMLElement) ||
			!(details instanceof HTMLDetailsElement) ||
			!(copyButton instanceof HTMLButtonElement)
		) {
			return;
		}

		root.dataset.pythonCodeCardBound = "true";
		display.innerHTML = renderCodeCardMarkup(source.value);
		syncCodeCardToggle(root);

		details.addEventListener("toggle", () => {
			syncCodeCardToggle(root);
		});

		copyButton.addEventListener("click", async () => {
			try {
				await navigator.clipboard.writeText(source.value);
				copyButton.textContent = "已复制";
				window.setTimeout(() => {
					copyButton.textContent = "复制代码";
				}, 1400);
			} catch (error) {
				copyButton.textContent = "复制失败";
				window.setTimeout(() => {
					copyButton.textContent = "复制代码";
				}, 1400);
			}
		});
	}

	function getPythonLabState(root) {
		return pythonLabStateMap.get(root) || null;
	}

	function getStoredPythonLabPosition() {
		try {
			const raw = localStorage.getItem(PYTHON_LAB_POSITION_KEY);
			if (!raw) {
				return null;
			}
			const parsed = JSON.parse(raw);
			if (
				typeof parsed?.left === "number" &&
				typeof parsed?.top === "number"
			) {
				return parsed;
			}
			if (
				typeof parsed?.right === "number" &&
				typeof parsed?.bottom === "number"
			) {
				return parsed;
			}
			return null;
		} catch (error) {
			return null;
		}
	}

	function storePythonLabPosition(position) {
		try {
			localStorage.setItem(PYTHON_LAB_POSITION_KEY, JSON.stringify(position));
		} catch (error) {
			// ignore storage failures
		}
	}

	function applyPythonLabPosition(root, position) {
		if (
			position &&
			typeof position.left === "number" &&
			typeof position.top === "number"
		) {
			root.style.setProperty(
				"--python-lab-panel-left",
				`${Math.round(position.left)}px`,
			);
			root.style.setProperty(
				"--python-lab-panel-top",
				`${Math.round(position.top)}px`,
			);
			root.style.setProperty("--python-lab-panel-right", "auto");
			root.style.setProperty("--python-lab-panel-bottom", "auto");
			return;
		}

		if (
			position &&
			typeof position.right === "number" &&
			typeof position.bottom === "number"
		) {
			root.style.setProperty("--python-lab-panel-left", "auto");
			root.style.setProperty("--python-lab-panel-top", "auto");
			root.style.setProperty(
				"--python-lab-panel-right",
				`${Math.round(position.right)}px`,
			);
			root.style.setProperty(
				"--python-lab-panel-bottom",
				`${Math.round(position.bottom)}px`,
			);
		}
	}

	function setPythonLabLoading(root, loading, message) {
		const labState = getPythonLabState(root);
		if (!labState) {
			return;
		}

		if (labState.loadingMask instanceof HTMLElement) {
			labState.loadingMask.hidden = !loading;
		}

		root.dataset.labLoading = loading ? "true" : "false";

		if (typeof message === "string" && message.length > 0) {
			labState.status.textContent = message;
		}
	}

	function clampPythonLabPosition(panel, left, top) {
		const rect = panel.getBoundingClientRect();
		const maxLeft = Math.max(16, window.innerWidth - rect.width - 16);
		const maxTop = Math.max(16, window.innerHeight - rect.height - 16);
		return {
			left: Math.min(Math.max(left, 16), maxLeft),
			top: Math.min(Math.max(top, 16), maxTop),
		};
	}

	function schedulePythonLabWarmup(root) {
		const labState = getPythonLabState(root);
		if (!labState || labState.runtimeWarmScheduled) {
			return;
		}

		const state = getState();
		if (state.pyodideLoaded || state.pyodidePromise) {
			return;
		}

		labState.runtimeWarmScheduled = true;
		const runWarmup = () => {
			labState.runtimeWarmScheduled = false;
			if (root.dataset.state !== "open") {
				return;
			}

			labState.status.textContent = "编辑器已就绪，正在预热 Python 运行时…";
			void ensurePyodide()
				.then(() => {
					if (root.dataset.state === "open") {
						labState.status.textContent = "Python Lab 已就绪，可以直接开始写题。";
					}
				})
				.catch(() => {
					if (root.dataset.state === "open") {
						labState.status.textContent =
							"编辑器已就绪，运行时会在首次执行时继续加载。";
					}
				});
		};

		if ("requestIdleCallback" in window) {
			labState.runtimeWarmHandle = window.requestIdleCallback(runWarmup, {
				timeout: 2200,
			});
			return;
		}

		labState.runtimeWarmHandle = window.setTimeout(runWarmup, 1200);
	}

	function schedulePythonLabValidation(root) {
		const labState = getPythonLabState(root);
		if (!labState?.editor) {
			return;
		}

		const state = getState();
		if (!state.pyodideLoaded || labState.editor.getValue().length > 8000) {
			return;
		}

		window.clearTimeout(labState.validationTimer);
		labState.validationTimer = window.setTimeout(async () => {
			const monaco = window.monaco;
			const model = labState.editor.getModel();
			if (!monaco || !model) {
				return;
			}

			try {
				const source = labState.editor.getValue();
				const result = await queueExecution(async () => {
					const pyodide = await ensurePyodide();
					await pyodide.runPythonAsync(`
import json

__mizuki_compile_error = ""
try:
    compile(${JSON.stringify(source)}, "<mizuki-python-lab>", "exec")
except SyntaxError as exc:
    __mizuki_compile_error = json.dumps({
        "message": exc.msg,
        "line": exc.lineno or 1,
        "column": exc.offset or 1,
        "endLine": getattr(exc, "end_lineno", None) or exc.lineno or 1,
        "endColumn": getattr(exc, "end_offset", None) or (exc.offset or 1) + 1,
    })
`);
					return readGlobal(pyodide, "__mizuki_compile_error");
				});

				if (!result) {
					setMonacoMarkers(monaco, model, []);
					return;
				}

				const error = JSON.parse(result);
				setMonacoMarkers(monaco, model, [
					{
						startLineNumber: error.line || 1,
						startColumn: Math.max(error.column || 1, 1),
						endLineNumber: error.endLine || error.line || 1,
						endColumn: Math.max(error.endColumn || (error.column || 1) + 1, 1),
						message: error.message || "Python 语法错误",
						severity: monaco.MarkerSeverity.Error,
					},
				]);
			} catch (error) {
				setMonacoMarkers(monaco, model, []);
			}
		}, 2200);
	}

	async function ensurePythonLabEditor(root) {
		const labState = getPythonLabState(root);
		if (!labState) {
			return null;
		}

		if (labState.editor) {
			return labState.editor;
		}

		if (labState.editorPromise) {
			return labState.editorPromise;
		}

		labState.editorPromise = (async () => {
			setPythonLabLoading(root, true, "正在准备 Monaco 编辑器…");
			labState.host.hidden = true;
			labState.fallback.hidden = true;
			labState.fallback.value = labState.source.value;

			try {
				const monaco = await ensureMonaco();
				ensureMonacoTheme(monaco);
				ensureMonacoCompletion(monaco);
				ensureMonacoHover(monaco);
				ensureMonacoSignatureHelp(monaco);

				labState.host.hidden = false;
				labState.editor = monaco.editor.create(labState.host, {
					value: labState.source.value,
					language: "python",
					theme: getMonacoThemeName(),
					automaticLayout: false,
					fixedOverflowWidgets: true,
					overflowWidgetsDomNode: document.body,
					minimap: { enabled: false },
					scrollBeyondLastLine: false,
					fontFamily:
						'"SF Mono", "JetBrains Mono Variable", "JetBrains Mono", Menlo, Monaco, ui-monospace, Consolas, "Liberation Mono", "Courier New", monospace',
					fontSize: 14,
					lineHeight: 24,
					padding: { top: 14, bottom: 14 },
					tabSize: 4,
					insertSpaces: true,
					quickSuggestions: { other: true, comments: false, strings: false },
					quickSuggestionsDelay: 220,
					wordBasedSuggestions: "off",
					suggestOnTriggerCharacters: true,
					acceptSuggestionOnEnter: "on",
					snippetSuggestions: "inline",
					glyphMargin: false,
					folding: false,
					occurrencesHighlight: "off",
					selectionHighlight: false,
					renderValidationDecorations: "editable",
					renderLineHighlight: "line",
					matchBrackets: "near",
					bracketPairColorization: { enabled: false },
					guides: {
						bracketPairs: false,
						indentation: false,
						highlightActiveIndentation: false,
					},
					wordWrap: "off",
					smoothScrolling: false,
					overviewRulerLanes: 0,
					hideCursorInOverviewRuler: true,
					lineNumbersMinChars: 3,
					mouseWheelZoom: false,
					stickyScroll: { enabled: false },
					scrollbar: {
						vertical: "auto",
						horizontal: "auto",
						useShadows: false,
						alwaysConsumeMouseWheel: false,
					},
				});

				if (typeof ResizeObserver !== "undefined") {
					labState.resizeObserver = new ResizeObserver(() => {
						labState.editor?.layout();
					});
					labState.resizeObserver.observe(labState.host);
				}

				labState.fallback.hidden = true;
				setPythonLabLoading(root, false, "Monaco 编辑器已就绪。");
				labState.editor.onDidChangeModelContent(() => {
					labState.source.value = labState.editor.getValue();
					labState.fallback.value = labState.source.value;
					schedulePythonLabValidation(root);
				});

				return labState.editor;
			} catch (error) {
				labState.host.hidden = true;
				labState.fallback.hidden = false;
				setPythonLabLoading(root, false, "Monaco 加载失败，已切换到轻量编辑器。");
				labState.status.textContent =
					"Monaco 加载失败，已切换到轻量编辑器。";
				return null;
			} finally {
				labState.editorPromise = null;
			}
		})();

		return labState.editorPromise;
	}

	function togglePythonLab(root, shouldOpen) {
		const state = getPythonLabState(root);
		if (!state) {
			return;
		}

		const nextOpen = typeof shouldOpen === "boolean" ? shouldOpen : state.panel.hidden;
		state.panel.hidden = !nextOpen;
		state.toggle.setAttribute("aria-expanded", nextOpen ? "true" : "false");
		root.dataset.state = nextOpen ? "open" : "closed";

		if (!nextOpen) {
			setPythonLabLoading(root, false);
			return;
		}

		if (state.editor) {
			setPythonLabLoading(root, false, "Python Lab 已就绪，可以继续写。");
			state.viewportSyncHandler?.();
			state.editor.layout();
			state.editor.focus();
			return;
		}

		if (!state.fallback.hidden) {
			setPythonLabLoading(root, false, "轻量编辑器已就绪，可以继续写。");
			state.viewportSyncHandler?.();
			state.fallback.focus();
			return;
		}

		setPythonLabLoading(root, true, "正在准备编辑器…");
		void ensurePythonLabEditor(root).then((editor) => {
			if (root.dataset.state !== "open") {
				return;
			}
			if (!editor) {
				state.status.textContent =
					"轻量编辑器已就绪。若 Monaco 稍后可用，会自动切换。";
				state.viewportSyncHandler?.();
				state.fallback.focus();
				return;
			}
			state.viewportSyncHandler?.();
			editor.layout();
			editor.focus();
			schedulePythonLabWarmup(root);
		});
	}

	async function runPythonLab(root) {
		const state = getPythonLabState(root);
		if (!state) {
			return;
		}

		const editor = await ensurePythonLabEditor(root);
		const code = editor ? editor.getValue() : state.fallback.value;
		state.source.value = code;
		state.runButton.disabled = true;
		state.status.textContent = "正在准备浏览器内 Python 运行时…";
		setOutput(state.output, "正在执行代码…", "loading");

		try {
			await queueExecution(async () => {
				const pyodide = await ensurePyodide();
				await pyodide.loadPackagesFromImports(code);
				await pyodide.runPythonAsync(`
import io
import sys
import traceback

__mizuki_stdout = io.StringIO()
__mizuki_stderr = io.StringIO()
__mizuki_traceback = ""
__mizuki_prev_stdout, __mizuki_prev_stderr = sys.stdout, sys.stderr

try:
    sys.stdout = __mizuki_stdout
    sys.stderr = __mizuki_stderr
    exec(${JSON.stringify(code)}, globals())
except Exception:
    __mizuki_traceback = traceback.format_exc()
finally:
    sys.stdout = __mizuki_prev_stdout
    sys.stderr = __mizuki_prev_stderr

__mizuki_output = __mizuki_stdout.getvalue()
__mizuki_error_output = __mizuki_stderr.getvalue()
`);

				const stdout = readGlobal(pyodide, "__mizuki_output");
				const stderr = readGlobal(pyodide, "__mizuki_error_output");
				const tracebackText = readGlobal(pyodide, "__mizuki_traceback");
				const finalOutput = [stdout, stderr, tracebackText]
					.filter(Boolean)
					.join("")
					.trimEnd();

				if (tracebackText) {
					setOutput(state.output, finalOutput || tracebackText, "error");
					state.status.textContent = "运行完成，但出现了 Python 错误。";
					return;
				}

				setOutput(state.output, finalOutput || "运行完成，没有标准输出。", "success");
				state.status.textContent = "运行完成。";
				schedulePythonLabValidation(root);
			});
		} catch (error) {
			setOutput(
				state.output,
				error instanceof Error ? error.message : "Python 运行失败",
				"error",
			);
			state.status.textContent = "运行失败。";
		} finally {
			state.runButton.disabled = false;
		}
	}

	function bindPythonLab(root) {
		if (!(root instanceof HTMLElement) || root.dataset.pythonLabBound === "true") {
			return;
		}

		const toggle = root.querySelector("[data-python-lab-toggle]");
		const panel = root.querySelector("[data-python-lab-panel]");
		const close = root.querySelector("[data-python-lab-close]");
		const runButton = root.querySelector("[data-python-lab-run]");
		const clearButton = root.querySelector("[data-python-lab-clear]");
		const output = root.querySelector("[data-python-lab-output]");
		const host = root.querySelector("[data-python-lab-editor]");
		const fallback = root.querySelector("[data-python-lab-fallback]");
		const dragHandle = root.querySelector("[data-python-lab-drag-handle]");
		const loadingMask = root.querySelector("[data-python-lab-loading]");
		const status = root.querySelector("[data-python-lab-status]");
		const source = root.querySelector("[data-python-lab-source]");

		if (
			!(toggle instanceof HTMLButtonElement) ||
			!(panel instanceof HTMLElement) ||
			!(close instanceof HTMLButtonElement) ||
			!(runButton instanceof HTMLButtonElement) ||
			!(clearButton instanceof HTMLButtonElement) ||
			!(output instanceof HTMLElement) ||
			!(host instanceof HTMLElement) ||
			!(fallback instanceof HTMLTextAreaElement) ||
			!(dragHandle instanceof HTMLElement) ||
			!(loadingMask instanceof HTMLElement) ||
			!(status instanceof HTMLElement) ||
			!(source instanceof HTMLTextAreaElement)
		) {
			return;
		}

		pythonLabStateMap.set(root, {
			toggle,
			panel,
			runButton,
			clearButton,
			output,
			host,
			fallback,
			loadingMask,
			status,
			source,
			editor: null,
			editorPromise: null,
			validationTimer: 0,
			resizeObserver: null,
			runtimeWarmScheduled: false,
			runtimeWarmHandle: 0,
			isDragging: false,
			viewportSyncHandler: null,
		});

		const storedPosition = getStoredPythonLabPosition();
		if (storedPosition) {
			applyPythonLabPosition(root, storedPosition);
		}

		const syncPanelWithinViewport = () => {
			if (panel.hidden) {
				return;
			}
			const rect = panel.getBoundingClientRect();
			const next = clampPythonLabPosition(panel, rect.left, rect.top);
			applyPythonLabPosition(root, next);
			storePythonLabPosition(next);
		};

		const currentState = getPythonLabState(root);
		if (currentState) {
			currentState.viewportSyncHandler = syncPanelWithinViewport;
		}

		window.addEventListener("resize", syncPanelWithinViewport);

		toggle.addEventListener("click", () => {
			togglePythonLab(root);
		});

		close.addEventListener("click", () => {
			togglePythonLab(root, false);
		});

		runButton.addEventListener("click", () => {
			void runPythonLab(root);
		});

		clearButton.addEventListener("click", () => {
			setOutput(output, "等待运行…", "idle");
			status.textContent = "输出已清空。";
		});

		fallback.value = source.value;
		fallback.addEventListener("input", () => {
			source.value = fallback.value;
		});

		document.addEventListener("keydown", (event) => {
			if (event.key === "Escape") {
				togglePythonLab(root, false);
			}
		});

		document.addEventListener("mousedown", (event) => {
			if (
				root.dataset.state === "open" &&
				!getPythonLabState(root)?.isDragging &&
				event.target instanceof Node &&
				!root.contains(event.target)
			) {
				togglePythonLab(root, false);
			}
		});

		root.querySelectorAll("[data-python-lab-drag-handle]").forEach((handle) => {
			if (!(handle instanceof HTMLElement)) {
				return;
			}

			handle.addEventListener("pointerdown", (event) => {
				if (
					event.button !== 0 ||
					(event.target instanceof HTMLElement &&
						event.target.closest("button, input, textarea, select, a"))
				) {
					return;
				}

				const currentState = getPythonLabState(root);
				if (!currentState) {
					return;
				}

				event.preventDefault();
				handle.setPointerCapture?.(event.pointerId);

				const rect = panel.getBoundingClientRect();
				const startLeft = rect.left;
				const startTop = rect.top;
				const startX = event.clientX;
				const startY = event.clientY;

				currentState.isDragging = true;
				root.dataset.dragging = "true";

				const onMove = (moveEvent) => {
					const deltaX = moveEvent.clientX - startX;
					const deltaY = moveEvent.clientY - startY;
					const next = clampPythonLabPosition(
						panel,
						startLeft + deltaX,
						startTop + deltaY,
					);
					applyPythonLabPosition(root, next);
				};

				const onUp = () => {
					const finalRect = panel.getBoundingClientRect();
					const next = clampPythonLabPosition(
						panel,
						finalRect.left,
						finalRect.top,
					);
					applyPythonLabPosition(root, next);
					storePythonLabPosition(next);
					currentState.isDragging = false;
					root.dataset.dragging = "false";
					handle.releasePointerCapture?.(event.pointerId);
					window.removeEventListener("pointermove", onMove);
					window.removeEventListener("pointerup", onUp);
					window.removeEventListener("pointercancel", onUp);
				};

				window.addEventListener("pointermove", onMove);
				window.addEventListener("pointerup", onUp, { once: true });
				window.addEventListener("pointercancel", onUp, { once: true });
			});
		});

		root.dataset.pythonLabBound = "true";
	}

	function upgradeLegacyPlayground(root) {
		if (!(root instanceof HTMLElement)) {
			return;
		}

		if (root.querySelector(".python-playground__details")) {
			return;
		}

		const editorShell = root.querySelector(".python-playground__editor-shell");
		const editorTop = root.querySelector(".python-playground__editor-top");
		const source = root.querySelector(".python-playground__code");
		const actions = root.querySelector(".python-playground__actions");
		const hint = root.querySelector(".python-playground__hint");
		const runButton = root.querySelector(".python-playground__run-button");
		const resetButton = root.querySelector(
			".python-playground__reset-button",
		);

		if (
			!(editorShell instanceof HTMLElement) ||
			!(source instanceof HTMLTextAreaElement) ||
			!(actions instanceof HTMLElement) ||
			!(runButton instanceof HTMLButtonElement)
		) {
			return;
		}

		const details = createElement("details", "python-playground__details");
		const summary = createElement("summary", "python-playground__summary");
		const summaryCopy = createElement(
			"div",
			"python-playground__summary-copy",
		);
		const label = createElement(
			"span",
			"python-playground__editor-label",
			"Practice Area",
		);
		const note = createElement(
			"span",
			"python-playground__editor-note",
			"点击展开后改代码，再运行查看结果",
		);
		const toggle = createElement(
			"span",
			"python-playground__summary-toggle",
			"展开练习区",
		);
		const editorRegion = createElement(
			"div",
			"python-playground__editor-region",
		);
		const newActions = createElement("div", "python-playground__actions");
		const actionButtons = createElement(
			"div",
			"python-playground__action-buttons",
		);

		summaryCopy.append(label, note);
		summary.append(summaryCopy, toggle);
		details.append(summary);

		if (editorTop instanceof HTMLElement) {
			editorTop.remove();
		}

		actionButtons.append(
			resetButton ||
				createElement(
					"button",
					"python-playground__reset-button",
					"恢复答案",
				),
			runButton,
		);

		if (hint instanceof HTMLElement) {
			hint.remove();
			newActions.append(hint);
		} else {
			newActions.append(
				createElement(
					"span",
					"python-playground__hint",
					"首次运行会加载浏览器内 Python 运行时",
				),
			);
		}
		newActions.append(actionButtons);

		if (actions.parentElement) {
			actions.remove();
		}

		editorRegion.append(editorShell, newActions);
		details.append(editorRegion);

		const toolbar = root.querySelector(".python-playground__toolbar");
		if (toolbar?.nextSibling) {
			root.insertBefore(details, toolbar.nextSibling);
		} else {
			root.append(details);
		}
	}

	function ensureEditorSurface(root) {
		if (!(root instanceof HTMLElement)) {
			return;
		}

		if (editorStateMap.has(root)) {
			return;
		}

		const editorShell = root.querySelector(".python-playground__editor-shell");
		const source = root.querySelector(".python-playground__code");

		if (
			!(editorShell instanceof HTMLElement) ||
			!(source instanceof HTMLTextAreaElement)
		) {
			return;
		}

		if (!editorShell.querySelector(".python-playground__workspace")) {
			const workspace = createElement("div", "python-playground__workspace");
			const editorHeader = createElement(
				"div",
				"python-playground__pane-header",
			);
			const editorTitle = createElement(
				"strong",
				"python-playground__pane-title",
				"Live Python Editor",
			);
			const editorNote = createElement(
				"span",
				"python-playground__pane-note",
				"边写边高亮，支持 Tab 缩进和关键词补全",
			);
			const editorField = createElement(
				"div",
				"python-playground__editor-field",
			);
			const frame = createElement("div", "python-playground__editor-frame");
			const host = createElement("div", "python-playground__editor-host");
			const autocomplete = createElement(
				"div",
				"python-playground__autocomplete",
			);
			const editor = createElement("div", "python-playground__editor");

			editorHeader.append(editorTitle, editorNote);

			editor.contentEditable = "true";
			editor.spellcheck = false;
			editor.setAttribute("role", "textbox");
			editor.setAttribute("aria-multiline", "true");
			editor.setAttribute("autocapitalize", "off");
			editor.setAttribute("autocorrect", "off");
			editor.setAttribute("data-gramm", "false");
			host.hidden = true;
			autocomplete.hidden = true;

			editorShell.textContent = "";
			frame.append(host, editor);
			editorField.append(frame);
			workspace.append(editorHeader, editorField, autocomplete);
			editorShell.append(workspace);
		}

		const editor = editorShell.querySelector(".python-playground__editor");
		const editorHost = editorShell.querySelector(".python-playground__editor-host");
		const autocomplete = editorShell.querySelector(
			".python-playground__autocomplete",
		);

		if (
			!(editor instanceof HTMLElement) ||
			!(editorHost instanceof HTMLElement) ||
			!(autocomplete instanceof HTMLElement)
		) {
			return;
		}

		source.setAttribute("autocomplete", "off");
		source.setAttribute("autocapitalize", "off");
		source.setAttribute("autocorrect", "off");
		source.setAttribute("spellcheck", "false");
		source.setAttribute("data-gramm", "false");
		source.hidden = true;

		editorStateMap.set(root, {
			source,
			editor,
			editorHost,
			autocomplete,
			suggestions: [],
			activeIndex: 0,
			context: null,
			monacoEditor: null,
			monacoModel: null,
			monacoLayoutTimer: 0,
		});

		renderEditor(root);
		hideAutocomplete(root);
	}

	function getEditorState(root) {
		return editorStateMap.get(root) || null;
	}

	function normalizeEditorText(value) {
		return value.replaceAll("\u00a0", " ").replaceAll("\r\n", "\n").replaceAll("\r", "\n");
	}

	function getSelectionOffsets(editor) {
		const selection = window.getSelection();
		if (!selection || selection.rangeCount === 0) {
			return null;
		}

		const range = selection.getRangeAt(0);
		if (!editor.contains(range.startContainer) || !editor.contains(range.endContainer)) {
			return null;
		}

		const startRange = range.cloneRange();
		startRange.selectNodeContents(editor);
		startRange.setEnd(range.startContainer, range.startOffset);

		const endRange = range.cloneRange();
		endRange.selectNodeContents(editor);
		endRange.setEnd(range.endContainer, range.endOffset);

		return {
			start: normalizeEditorText(startRange.toString()).length,
			end: normalizeEditorText(endRange.toString()).length,
		};
	}

	function findTextPosition(root, index) {
		const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
		let remaining = index;
		let lastNode = null;

		while (walker.nextNode()) {
			const node = walker.currentNode;
			const length = node.textContent?.length ?? 0;
			lastNode = node;

			if (remaining <= length) {
				return {
					node,
					offset: remaining,
				};
			}

			remaining -= length;
		}

		if (lastNode) {
			return {
				node: lastNode,
				offset: lastNode.textContent?.length ?? 0,
			};
		}

		const textNode = document.createTextNode("");
		root.append(textNode);
		return {
			node: textNode,
			offset: 0,
		};
	}

	function restoreSelection(editor, start, end = start) {
		const selection = window.getSelection();
		if (!selection) {
			return;
		}

		const range = document.createRange();
		const startPosition = findTextPosition(editor, start);
		const endPosition = findTextPosition(editor, end);

		range.setStart(startPosition.node, startPosition.offset);
		range.setEnd(endPosition.node, endPosition.offset);

		selection.removeAllRanges();
		selection.addRange(range);
	}

	function renderEditor(root, selection = null) {
		const editorState = getEditorState(root);
		if (!editorState) {
			return;
		}

		editorState.editor.innerHTML = renderHighlightedPython(
			editorState.source.value,
		);

		if (selection) {
			restoreSelection(editorState.editor, selection.start, selection.end);
		}
	}

	function refreshEditor(root) {
		const editorState = getEditorState(root);
		if (!editorState) {
			return;
		}

		if (editorState.monacoEditor) {
			scheduleMonacoLayout(root);
			return;
		}

		const selection =
			document.activeElement === editorState.editor
				? getSelectionOffsets(editorState.editor)
				: null;

		renderEditor(root, selection);
	}

	function layoutMonacoEditor(root) {
		const editorState = getEditorState(root);
		if (!editorState?.monacoEditor || !(editorState.editorHost instanceof HTMLElement)) {
			return;
		}

		const contentHeight = editorState.monacoEditor.getContentHeight();
		const height = Math.max(contentHeight + 6, 256);
		editorState.editorHost.style.height = `${height}px`;
		editorState.monacoEditor.layout();
	}

	function requestMonacoUpgrade(root, { idle = false } = {}) {
		if (!(root instanceof HTMLElement) || root.dataset.monacoUpgradeRequested === "true") {
			return;
		}

		const startUpgrade = () => {
			if (root.dataset.monacoUpgradeRequested === "true") {
				return;
			}
			root.dataset.monacoUpgradeRequested = "true";
			void maybeEnableMonaco(root);
		};

		if (idle && "requestIdleCallback" in window) {
			window.requestIdleCallback(startUpgrade, { timeout: 2200 });
			return;
		}

		window.setTimeout(startUpgrade, idle ? 900 : 0);
	}

	async function maybeEnableMonaco(root) {
		const editorState = getEditorState(root);
		if (!editorState || editorState.monacoEditor) {
			return;
		}

		try {
			const monaco = await ensureMonaco();
			ensureMonacoTheme(monaco);
			ensureMonacoCompletion(monaco);
			ensureMonacoHover(monaco);
			ensureMonacoSignatureHelp(monaco);

			if (!(editorState.editorHost instanceof HTMLElement)) {
				return;
			}

			editorState.editorHost.hidden = false;
			editorState.monacoEditor = monaco.editor.create(
				editorState.editorHost,
				{
					value: editorState.source.value,
					language: "python",
					theme: getMonacoThemeName(),
					automaticLayout: false,
					fixedOverflowWidgets: true,
					overflowWidgetsDomNode: document.body,
					minimap: { enabled: false },
					scrollBeyondLastLine: false,
					wordWrap: "off",
					wrappingStrategy: "simple",
					fontFamily:
						'"SF Mono", "JetBrains Mono Variable", "JetBrains Mono", Menlo, Monaco, ui-monospace, Consolas, "Liberation Mono", "Courier New", monospace',
					fontSize: 15,
					lineHeight: 28,
					padding: {
						top: 16,
						bottom: 16,
					},
					tabSize: 4,
					insertSpaces: true,
					quickSuggestions: {
						other: true,
						comments: false,
						strings: false,
					},
					quickSuggestionsDelay: 160,
					wordBasedSuggestions: "currentDocument",
					suggestOnTriggerCharacters: true,
					acceptSuggestionOnEnter: "on",
					snippetSuggestions: "inline",
					contextmenu: true,
					glyphMargin: false,
					lineNumbersMinChars: 2,
					renderLineHighlight: "line",
					renderLineHighlightOnlyWhenFocus: true,
					folding: false,
					selectionHighlight: false,
					occurrencesHighlight: "off",
					unicodeHighlight: {
						ambiguousCharacters: false,
						invisibleCharacters: false,
						nonBasicASCII: false,
					},
					guides: {
						indentation: false,
						highlightActiveIndentation: false,
						bracketPairs: false,
					},
					bracketPairColorization: {
						enabled: false,
					},
					smoothScrolling: false,
					cursorSmoothCaretAnimation: "off",
					hover: {
						enabled: true,
						delay: 180,
					},
					parameterHints: {
						enabled: true,
					},
					scrollbar: {
						vertical: "hidden",
						horizontal: "hidden",
						useShadows: false,
						alwaysConsumeMouseWheel: false,
						handleMouseWheel: false,
					},
					stickyScroll: {
						enabled: false,
					},
					mouseWheelZoom: false,
					links: false,
				},
			);

			root.classList.add("python-playground--monaco");
			editorState.editor.hidden = true;
			editorState.editor.contentEditable = "false";
			editorState.monacoModel = editorState.monacoEditor.getModel();

			editorState.monacoEditor.onDidFocusEditorText(() => {
				hideAutocomplete(root);
			});
			editorState.monacoEditor.onDidChangeModelContent(() => {
				editorState.source.value = editorState.monacoEditor.getValue();
				scheduleMonacoValidation(root);
			});
			editorState.monacoEditor.onDidContentSizeChange(() => {
				scheduleMonacoLayout(root);
			});

			layoutMonacoEditor(root);
		} catch (error) {
			if (root instanceof HTMLElement) {
				delete root.dataset.monacoUpgradeRequested;
			}
			console.warn("Monaco editor unavailable, falling back to lightweight editor.", error);
		}
	}

	function hideAutocomplete(root) {
		const editorState = getEditorState(root);
		if (!editorState) {
			return;
		}

		editorState.autocomplete.hidden = true;
		editorState.autocomplete.innerHTML = "";
		editorState.suggestions = [];
		editorState.activeIndex = 0;
		editorState.context = null;
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
		const dynamicIdentifiers = Array.from(
			new Set(source.match(/[A-Za-z_][A-Za-z0-9_]*/g) || []),
		);
		return Array.from(new Set([...dynamicIdentifiers, ...PYTHON_SUGGESTIONS]))
			.filter((item) => {
				return (
					item.toLowerCase().startsWith(normalizedPrefix) &&
					item !== prefix
				);
			})
			.sort((left, right) =>
				left.localeCompare(right, "en", { sensitivity: "base" }),
			)
			.slice(0, 8);
	}

	function getSuggestionMeta(suggestion) {
		if (PYTHON_KEYWORDS.has(suggestion)) {
			return "keyword";
		}
		if (PYTHON_BUILTINS.has(suggestion)) {
			return "builtin";
		}
		return "symbol";
	}

	function setActiveSuggestion(root, index) {
		const editorState = getEditorState(root);
		if (!editorState || editorState.suggestions.length === 0) {
			return;
		}

		const nextIndex =
			(index + editorState.suggestions.length) %
			editorState.suggestions.length;
		editorState.activeIndex = nextIndex;

		editorState.autocomplete
			.querySelectorAll(".python-playground__suggestion")
			.forEach((item, itemIndex) => {
				if (!(item instanceof HTMLElement)) {
					return;
				}

				const isActive = itemIndex === nextIndex;
				item.classList.toggle("is-active", isActive);
				item.setAttribute("aria-selected", isActive ? "true" : "false");
			});
	}

	function replaceSourceRange(root, start, end, replacement) {
		const editorState = getEditorState(root);
		if (!editorState) {
			return 0;
		}

		editorState.source.value =
			editorState.source.value.slice(0, start) +
			replacement +
			editorState.source.value.slice(end);

		const nextCaret = start + replacement.length;
		renderEditor(root, { start: nextCaret, end: nextCaret });
		editorState.editor.focus();
		return nextCaret;
	}

	function syncSourceFromEditor(root) {
		const editorState = getEditorState(root);
		if (!editorState) {
			return null;
		}

		const selection = getSelectionOffsets(editorState.editor) ?? {
			start: 0,
			end: 0,
		};

		editorState.source.value = normalizeEditorText(
			editorState.editor.textContent || "",
		);
		renderEditor(root, selection);
		return selection;
	}

	function applySuggestion(root, suggestion) {
		const editorState = getEditorState(root);
		if (!editorState || !editorState.context) {
			return;
		}

		const { context } = editorState;
		replaceSourceRange(root, context.start, context.end, suggestion);
		hideAutocomplete(root);
	}

	function updateAutocomplete(root) {
		const editorState = getEditorState(root);
		if (!editorState) {
			return;
		}

		const { source, editor, autocomplete } = editorState;
		const selection = getSelectionOffsets(editor);
		if (!selection || selection.start !== selection.end) {
			hideAutocomplete(root);
			return;
		}

		const context = getCompletionContext(source.value, selection.start);
		if (!context || context.prefix.length < 1) {
			hideAutocomplete(root);
			return;
		}

		const suggestions = collectSuggestions(context.prefix, source.value);
		if (suggestions.length === 0) {
			hideAutocomplete(root);
			return;
		}

		editorState.context = context;
		editorState.suggestions = suggestions;
		editorState.activeIndex = 0;
		autocomplete.innerHTML = "";
		autocomplete.hidden = false;

		suggestions.forEach((suggestion, index) => {
			const button = createElement(
				"button",
				"python-playground__suggestion",
			);
			button.type = "button";
			button.dataset.suggestion = suggestion;
			button.setAttribute("role", "option");
			button.setAttribute(
				"aria-selected",
				index === 0 ? "true" : "false",
			);
			if (index === 0) {
				button.classList.add("is-active");
			}

			const keyword = createElement(
				"span",
				"python-playground__suggestion-keyword",
				suggestion,
			);
			const meta = createElement(
				"span",
				"python-playground__suggestion-meta",
				getSuggestionMeta(suggestion),
			);

			button.append(keyword, meta);
			button.addEventListener("mousedown", (event) => {
				event.preventDefault();
				applySuggestion(root, suggestion);
			});
			autocomplete.append(button);
		});
	}

	function insertIndentation(root) {
		const editorState = getEditorState(root);
		if (!editorState) {
			return;
		}

		const selection = getSelectionOffsets(editorState.editor);
		if (!selection) {
			return;
		}

		const { start, end } = selection;
		const value = editorState.source.value;

		if (start !== end && value.slice(start, end).includes("\n")) {
			const lineStart = value.lastIndexOf("\n", start - 1) + 1;
			const block = value.slice(lineStart, end);
			const indented = block
				.split("\n")
				.map((line) => `${INDENT}${line}`)
				.join("\n");

			editorState.source.value =
				value.slice(0, lineStart) + indented + value.slice(end);
			renderEditor(root, {
				start: start + INDENT.length,
				end: end + INDENT.length * indented.split("\n").length,
			});
			editorState.editor.focus();
			return;
		}

		replaceSourceRange(root, start, end, INDENT);
	}

	function getCurrentLineIndent(source, index) {
		const lineStart = source.lastIndexOf("\n", Math.max(index - 1, 0)) + 1;
		const line = source.slice(lineStart, index);
		const indentMatch = line.match(/^[ \t]*/);
		return indentMatch ? indentMatch[0] : "";
	}

	function insertNewlineWithIndent(root) {
		const editorState = getEditorState(root);
		if (!editorState) {
			return;
		}

		const selection = getSelectionOffsets(editorState.editor);
		if (!selection) {
			return;
		}

		const { start, end } = selection;
		const currentIndent = getCurrentLineIndent(editorState.source.value, start);
		const beforeCursor = editorState.source.value.slice(0, start);
		const currentLine = beforeCursor.slice(
			beforeCursor.lastIndexOf("\n") + 1,
		);
		const extraIndent = currentLine.trimEnd().endsWith(":") ? INDENT : "";

		replaceSourceRange(root, start, end, `\n${currentIndent}${extraIndent}`);
		hideAutocomplete(root);
	}

	function removeIndentation(root) {
		const editorState = getEditorState(root);
		if (!editorState) {
			return;
		}

		const selection = getSelectionOffsets(editorState.editor);
		if (!selection) {
			return;
		}

		const { start, end } = selection;
		const lineStart = editorState.source.value.lastIndexOf("\n", Math.max(start - 1, 0)) + 1;
		const removable = editorState.source.value.slice(lineStart, lineStart + INDENT.length);
		if (removable !== INDENT) {
			return;
		}

		editorState.source.value =
			editorState.source.value.slice(0, lineStart) +
			editorState.source.value.slice(lineStart + INDENT.length);
		const nextStart = Math.max(lineStart, start - INDENT.length);
		const nextEnd = Math.max(nextStart, end - INDENT.length);
		renderEditor(root, { start: nextStart, end: nextEnd });
		editorState.editor.focus();
	}

	function handleEditorKeydown(event, root) {
		const editorState = getEditorState(root);
		if (!editorState) {
			return;
		}

		const { source, suggestions, activeIndex } = editorState;
		const hasAutocomplete =
			!editorState.autocomplete.hidden && suggestions.length > 0;

		if (event.key === "Tab") {
			event.preventDefault();
			if (hasAutocomplete) {
				applySuggestion(root, suggestions[activeIndex]);
				return;
			}
			if (event.shiftKey) {
				removeIndentation(root);
				hideAutocomplete(root);
				return;
			}
			insertIndentation(root);
			hideAutocomplete(root);
			return;
		}

		if (event.key === "ArrowDown") {
			if (!hasAutocomplete) {
				return;
			}
			event.preventDefault();
			setActiveSuggestion(root, activeIndex + 1);
			return;
		}

		if (event.key === "ArrowUp") {
			if (!hasAutocomplete) {
				return;
			}
			event.preventDefault();
			setActiveSuggestion(root, activeIndex - 1);
			return;
		}

		if (event.key === "Enter") {
			event.preventDefault();
			if (hasAutocomplete) {
				applySuggestion(root, suggestions[activeIndex]);
				return;
			}
			insertNewlineWithIndent(root);
			return;
		}

		if (!hasAutocomplete) {
			return;
		}

		if (event.key === "Escape") {
			event.preventDefault();
			hideAutocomplete(root);
		}
	}

	function syncToggleLabel(root) {
		const details = root.querySelector(".python-playground__details");
		const label = root.querySelector(".python-playground__summary-toggle");
		if (!(details instanceof HTMLDetailsElement) || !label) {
			return;
		}

		label.textContent = details.open ? "收起练习区" : "展开练习区";
	}

	async function runPlayground(root) {
		const runButton = root.querySelector(".python-playground__run-button");
		const resetButton = root.querySelector(
			".python-playground__reset-button",
		);
		const output = root.querySelector(".python-playground__output");
		const editorState = getEditorState(root);
		const source = editorState?.source;
		const details = root.querySelector(".python-playground__details");

		if (!runButton || !output || !source) {
			return;
		}

		if (details instanceof HTMLDetailsElement && !details.open) {
			details.open = true;
			syncToggleLabel(root);
			refreshEditor(root);
		}

		const code = source.value;
		const packages = (root.dataset.pythonPackages || "")
			.split(",")
			.map((item) => item.trim())
			.filter(Boolean);

		runButton.disabled = true;
		if (resetButton) {
			resetButton.disabled = true;
		}
		runButton.dataset.state = "loading";
		runButton.textContent = "运行中...";
		setOutput(output, "正在准备浏览器内 Python 运行时...", "loading");

		try {
			await queueExecution(async () => {
				const pyodide = await ensurePyodide();
				setOutput(output, "运行时已就绪，正在加载依赖...", "loading");

				if (typeof pyodide.loadPackagesFromImports === "function") {
					await pyodide.loadPackagesFromImports(code);
				}

				if (packages.length > 0) {
					await pyodide.loadPackage(packages);
				}

				setOutput(output, "正在执行代码...", "loading");

				await pyodide.runPythonAsync(`
import io
import sys
import traceback

__mizuki_stdout = io.StringIO()
__mizuki_stderr = io.StringIO()
__mizuki_traceback = ""
__mizuki_prev_stdout, __mizuki_prev_stderr = sys.stdout, sys.stderr

try:
    sys.stdout = __mizuki_stdout
    sys.stderr = __mizuki_stderr
    exec(${JSON.stringify(code)}, globals())
except Exception:
    __mizuki_traceback = traceback.format_exc()
finally:
    sys.stdout = __mizuki_prev_stdout
    sys.stderr = __mizuki_prev_stderr

__mizuki_output = __mizuki_stdout.getvalue()
__mizuki_error_output = __mizuki_stderr.getvalue()
`);

				const stdout = readGlobal(pyodide, "__mizuki_output");
				const stderr = readGlobal(pyodide, "__mizuki_error_output");
				const tracebackText = readGlobal(pyodide, "__mizuki_traceback");
				const finalOutput = [stdout, stderr, tracebackText]
					.filter(Boolean)
					.join("")
					.trimEnd();

				if (tracebackText) {
					setOutput(output, finalOutput || tracebackText, "error");
					return;
				}

				setOutput(
					output,
					finalOutput || "运行完成，没有标准输出。",
					"success",
				);
			});
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Python 代码执行失败";
			setOutput(output, message, "error");
		} finally {
			runButton.disabled = false;
			if (resetButton) {
				resetButton.disabled = false;
			}
			runButton.dataset.state = "ready";
			runButton.textContent = "重新运行";
		}
	}

	function resetPlayground(root) {
		const editorState = getEditorState(root);
		const answer = root.querySelector(".python-playground__answer");
		const output = root.querySelector(".python-playground__output");
		const placeholder =
			root.dataset.pythonPlaceholder || "点击“运行代码”查看输出";

		if (!editorState || !(answer instanceof HTMLTextAreaElement)) {
			return;
		}

		editorState.source.value = answer.value;
		if (editorState.monacoEditor) {
			editorState.monacoEditor.setValue(answer.value);
			layoutMonacoEditor(root);
		} else {
			refreshEditor(root);
		}
		hideAutocomplete(root);
		if (output) {
			setOutput(output, placeholder, "idle");
		}
		const end = editorState.source.value.length;
		if (editorState.monacoEditor) {
			const model = editorState.monacoEditor.getModel();
			if (model) {
				const position = model.getPositionAt(end);
				editorState.monacoEditor.setPosition(position);
				editorState.monacoEditor.focus();
			}
		} else {
			renderEditor(root, { start: end, end });
			editorState.editor.focus();
		}
	}

	function bindPlayground(root) {
		if (root.dataset.pythonBound === "true") {
			return;
		}

		upgradeLegacyPlayground(root);
		ensureEditorSurface(root);

		const editorState = getEditorState(root);
		const runButton = root.querySelector(".python-playground__run-button");
		const resetButton = root.querySelector(
			".python-playground__reset-button",
		);
		const details = root.querySelector(".python-playground__details");
		const editor = editorState?.editor;

		if (!runButton || !(editor instanceof HTMLElement)) {
			return;
		}

		root.dataset.pythonBound = "true";
		refreshEditor(root);
		editor.addEventListener("input", () => {
			syncSourceFromEditor(root);
			updateAutocomplete(root);
			if (
				root.querySelector(".python-playground__details[open]") &&
				editorState?.source.value.length > 32
			) {
				requestMonacoUpgrade(root, { idle: true });
			}
		});
		editor.addEventListener("click", () => {
			updateAutocomplete(root);
		});
		editor.addEventListener("keyup", () => updateAutocomplete(root));
		editor.addEventListener("focus", () => {
			updateAutocomplete(root);
		});
		editor.addEventListener("paste", (event) => {
			event.preventDefault();
			const text = event.clipboardData?.getData("text/plain") || "";
			const selection = getSelectionOffsets(editor);
			if (!selection) {
				return;
			}
			replaceSourceRange(root, selection.start, selection.end, text);
			updateAutocomplete(root);
		});
		editor.addEventListener("blur", () => {
			window.setTimeout(() => hideAutocomplete(root), 120);
		});
		editor.addEventListener("keydown", (event) => {
			handleEditorKeydown(event, root);
		});

		if (details instanceof HTMLDetailsElement) {
			syncToggleLabel(root);
			details.addEventListener("toggle", () => {
				syncToggleLabel(root);
				if (details.open) {
					refreshEditor(root);
					layoutMonacoEditor(root);
					updateAutocomplete(root);
					requestMonacoUpgrade(root, { idle: true });
				} else {
					hideAutocomplete(root);
				}
			});
		}

		runButton.addEventListener("click", () => {
			void runPlayground(root);
		});
		if (resetButton) {
			resetButton.addEventListener("click", () => {
				resetPlayground(root);
			});
		}
	}

	function initPythonPlaygrounds() {
		document
			.querySelectorAll("[data-python-playground]")
			.forEach((element) => {
				const next = normalizeLegacyPlayground(element);
				if (next) {
					bindPythonCodeCard(next);
				}
			});
	}

	function initPythonCodeCards() {
		document
			.querySelectorAll("[data-python-code-card]")
			.forEach((element) => bindPythonCodeCard(element));
	}

	function initPythonLabs() {
		document
			.querySelectorAll("[data-python-lab]")
			.forEach((element) => bindPythonLab(element));
	}

	function initPythonEnhancements() {
		initPythonPlaygrounds();
		initPythonCodeCards();
		initPythonLabs();
	}

	document.addEventListener("DOMContentLoaded", initPythonEnhancements);
	initPythonEnhancements();
})();

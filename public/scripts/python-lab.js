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
		focusEditor(state);
	}

	function closePanel(state) {
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

	function insertAtCursor(textarea, text) {
		const start = textarea.selectionStart;
		const end = textarea.selectionEnd;
		textarea.setRangeText(text, start, end, "end");
	}

	function handleEditorKeydown(state, event) {
		if (event.key === "Tab") {
			event.preventDefault();
			insertAtCursor(state.editor, INDENT);
			saveDraft(state);
			return;
		}

		if (event.key === "Enter") {
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
				typeof tracebackValue === "string"
					? tracebackValue
					: tracebackValue?.toString?.() || "";
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

	function init(root) {
		if (!(root instanceof HTMLElement) || root.dataset.pythonLabReady === "true") {
			return;
		}

		const toggle = root.querySelector("[data-python-lab-toggle]");
		const panel = root.querySelector("[data-python-lab-panel]");
		const close = root.querySelector("[data-python-lab-close]");
		const editor = root.querySelector("[data-python-lab-editor]");
		const runButton = root.querySelector("[data-python-lab-run]");
		const resetButton = root.querySelector("[data-python-lab-reset]");
		const clearButton = root.querySelector("[data-python-lab-clear]");
		const status = root.querySelector("[data-python-lab-status]");
		const output = root.querySelector("[data-python-lab-output]");
		const dragHandle = root.querySelector("[data-python-lab-drag-handle]");
		const source = root.querySelector("[data-python-lab-source]");

		if (
			!(toggle instanceof HTMLButtonElement) ||
			!(panel instanceof HTMLElement) ||
			!(close instanceof HTMLButtonElement) ||
			!(editor instanceof HTMLTextAreaElement) ||
			!(runButton instanceof HTMLButtonElement) ||
			!(resetButton instanceof HTMLButtonElement) ||
			!(clearButton instanceof HTMLButtonElement) ||
			!(status instanceof HTMLElement) ||
			!(output instanceof HTMLElement) ||
			!(dragHandle instanceof HTMLElement) ||
			!(source instanceof HTMLTextAreaElement)
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
			runButton,
			resetButton,
			clearButton,
			status,
			output,
			dragHandle,
			source,
		};
		labState.set(root, state);

		restoreDraft(state);
		setStatus(state, "轻量编辑器已就绪，首次运行时再加载浏览器内 Python。");
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
			setStatus(state, "示例代码已恢复。");
			focusEditor(state);
		});

		clearButton.addEventListener("click", () => {
			setOutput(state, "等待运行…", "idle");
			setStatus(state, "输出已清空。");
		});

		editor.addEventListener("input", () => {
			saveDraft(state);
		});

		editor.addEventListener("keydown", (event) => {
			handleEditorKeydown(state, event);
		});

		document.addEventListener(
			"mousedown",
			(event) => {
				if (
					panel.hidden ||
					!(event.target instanceof Node) ||
					root.contains(event.target) ||
					panel.contains(event.target)
				) {
					return;
				}
				closePanel(state);
			},
			true,
		);

		document.addEventListener("keydown", (event) => {
			if (event.key === "Escape" && !panel.hidden) {
				closePanel(state);
			}
		});

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

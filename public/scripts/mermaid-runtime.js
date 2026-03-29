(() => {
	if (window.__owenMermaidRuntime) {
		if (typeof window.renderMermaidDiagrams !== "function") {
			window.renderMermaidDiagrams = window.__owenMermaidRuntime.renderMermaidDiagrams;
		}
		return;
	}

	const state = {
		rendering: false,
		currentTheme: null,
		loadPromise: null,
	};

	function normalizeMermaidCode(rawCode) {
		if (typeof rawCode !== "string") {
			return "";
		}

		const trimmed = rawCode.trim();
		const initMatch = trimmed.match(/^%%\{init:\s*([\s\S]*?)\}\s*%%\s*/);
		if (!initMatch) {
			return trimmed;
		}

		const configSource = initMatch[1];
		const remainingCode = trimmed.slice(initMatch[0].length).trimStart();

		try {
			const parsed = JSON.parse(configSource);
			delete parsed.theme;
			delete parsed.themeVariables;

			if (Object.keys(parsed).length === 0) {
				return remainingCode;
			}

			return `%%{init: ${JSON.stringify(parsed)}}%%\n${remainingCode}`;
		} catch (error) {
			console.warn("[mermaid] invalid init block, dropping custom init for stability", error);
			return remainingCode;
		}
	}

	function loadMermaidLibrary() {
		if (window.mermaid && typeof window.mermaid.initialize === "function") {
			return Promise.resolve(window.mermaid);
		}

		if (state.loadPromise) {
			return state.loadPromise;
		}

		state.loadPromise = new Promise((resolve, reject) => {
			const existingScript = document.querySelector("script[data-owen-mermaid-cdn]");
			if (existingScript) {
				existingScript.addEventListener("load", () => resolve(window.mermaid), { once: true });
				existingScript.addEventListener("error", reject, { once: true });
				return;
			}

			const script = document.createElement("script");
			script.src = "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js";
			script.async = true;
			script.defer = true;
			script.setAttribute("data-owen-mermaid-cdn", "true");

			script.addEventListener("load", () => resolve(window.mermaid), { once: true });
			script.addEventListener(
				"error",
				() => {
					const fallbackScript = document.createElement("script");
					fallbackScript.src = "https://unpkg.com/mermaid@11/dist/mermaid.min.js";
					fallbackScript.async = true;
					fallbackScript.defer = true;
					fallbackScript.setAttribute("data-owen-mermaid-cdn", "fallback");
					fallbackScript.addEventListener("load", () => resolve(window.mermaid), { once: true });
					fallbackScript.addEventListener(
						"error",
						() => reject(new Error("Failed to load Mermaid from both primary and fallback CDNs")),
						{ once: true },
					);
					document.head.appendChild(fallbackScript);
				},
				{ once: true },
			);

			document.head.appendChild(script);
		});

		return state.loadPromise;
	}

	async function renderMermaidDiagrams() {
		if (state.rendering) {
			return;
		}

		const targets = Array.from(document.querySelectorAll(".mermaid[data-mermaid-code]"));
		if (targets.length === 0) {
			return;
		}

		state.rendering = true;

		try {
			await loadMermaidLibrary();

			const isDark = document.documentElement.classList.contains("dark");
			const theme = isDark ? "dark" : "default";
			state.currentTheme = theme;

			window.mermaid.initialize({
				startOnLoad: false,
				theme,
				securityLevel: "loose",
				errorLevel: "warn",
				logLevel: "error",
			});

			for (let index = 0; index < targets.length; index += 1) {
				const element = targets[index];
				const rawCode = element.getAttribute("data-mermaid-code") || "";
				const code = normalizeMermaidCode(rawCode);
				const signature = `${theme}:${code}`;

				if (element.dataset.mermaidSignature === signature && element.querySelector("svg")) {
					continue;
				}

				element.innerHTML = '<div class="mermaid-loading">Rendering diagram...</div>';

				try {
					const { svg } = await window.mermaid.render(`owen-mermaid-${Date.now()}-${index}`, code);
					const parser = new DOMParser();
					const doc = parser.parseFromString(svg, "image/svg+xml");
					const svgElement = doc.documentElement;

					element.innerHTML = "";
					element.appendChild(svgElement);
					element.classList.add("is-rendered");
					element.dataset.mermaidSignature = signature;

					const insertedSvg = element.querySelector("svg");
					if (insertedSvg) {
						insertedSvg.setAttribute("width", "100%");
						insertedSvg.removeAttribute("height");
						insertedSvg.style.maxWidth = "100%";
						insertedSvg.style.height = "auto";
						insertedSvg.style.minHeight = "0";
						insertedSvg.style.display = "block";
						insertedSvg.style.marginInline = "auto";
					}
				} catch (error) {
					console.error("[mermaid] render failed", error);
					element.innerHTML = `
						<div class="mermaid-error">
							<p>Failed to render Mermaid diagram.</p>
							<button type="button" data-mermaid-retry>Retry</button>
						</div>
					`;
					const retryButton = element.querySelector("[data-mermaid-retry]");
					if (retryButton) {
						retryButton.addEventListener("click", () => {
							delete element.dataset.mermaidSignature;
							renderMermaidDiagrams();
						});
					}
				}
			}
		} catch (error) {
			console.error("[mermaid] runtime initialization failed", error);
		} finally {
			state.rendering = false;
		}
	}

	function scheduleRender(delay = 80) {
		window.clearTimeout(window.__owenMermaidRenderTimer);
		window.__owenMermaidRenderTimer = window.setTimeout(() => {
			renderMermaidDiagrams();
		}, delay);
	}

	function setupObservers() {
		const observer = new MutationObserver((mutations) => {
			for (const mutation of mutations) {
				if (mutation.type === "attributes" && mutation.attributeName === "class") {
					const nextTheme = document.documentElement.classList.contains("dark") ? "dark" : "default";
					if (nextTheme !== state.currentTheme) {
						scheduleRender(120);
					}
				}
			}
		});

		observer.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ["class"],
		});

		document.addEventListener("astro:page-load", () => scheduleRender(40));
		document.addEventListener("pageshow", () => scheduleRender(40));
		document.addEventListener("visibilitychange", () => {
			if (!document.hidden) {
				scheduleRender(60);
			}
		});
	}

	function initialize() {
		setupObservers();
		renderMermaidDiagrams();
		window.renderMermaidDiagrams = renderMermaidDiagrams;
		window.__owenMermaidRuntime = { renderMermaidDiagrams };
	}

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", initialize, { once: true });
	} else {
		initialize();
	}
})();

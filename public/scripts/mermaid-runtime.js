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
		lightbox: null,
		loadPromise: null,
	};

	function getThemeVariables(isDark) {
		if (isDark) {
			return {
				fontFamily: "inherit",
				fontSize: "16px",
				background: "#0b1220",
				primaryColor: "#131d30",
				primaryTextColor: "#edf3ff",
				primaryBorderColor: "#8aa8ff",
				lineColor: "#8aa8ff",
				secondaryColor: "#172338",
				tertiaryColor: "#10192a",
				mainBkg: "#131d30",
				secondBkg: "#172338",
				tertiaryBkg: "#10192a",
				clusterBkg: "#10192a",
				clusterBorder: "#6f8eff",
				nodeBorder: "#8aa8ff",
				textColor: "#edf3ff",
				labelTextColor: "#edf3ff",
				edgeLabelBackground: "#0f1828",
				actorBkg: "#131d30",
				actorBorder: "#8aa8ff",
				actorTextColor: "#edf3ff",
				noteBkgColor: "#18253b",
				noteTextColor: "#edf3ff",
				noteBorderColor: "#8aa8ff",
				activationBorderColor: "#8aa8ff",
				activationBkgColor: "#18253b",
				sequenceNumberColor: "#edf3ff",
			};
		}

		return {
			fontFamily: "inherit",
			fontSize: "16px",
			background: "#fff8fb",
			primaryColor: "#fff9fc",
			primaryTextColor: "#6b3550",
			primaryBorderColor: "#df8ab2",
			lineColor: "#df8ab2",
			secondaryColor: "#fff2f7",
			tertiaryColor: "#ffe8f1",
			mainBkg: "#fff9fc",
			secondBkg: "#fff2f7",
			tertiaryBkg: "#ffe8f1",
			clusterBkg: "#fff4f8",
			clusterBorder: "#ebb0c8",
			nodeBorder: "#df8ab2",
			textColor: "#6b3550",
			labelTextColor: "#6b3550",
			edgeLabelBackground: "#fff9fc",
			actorBkg: "#fff9fc",
			actorBorder: "#df8ab2",
			actorTextColor: "#6b3550",
			noteBkgColor: "#fff2f7",
			noteTextColor: "#6b3550",
			noteBorderColor: "#df8ab2",
			activationBorderColor: "#df8ab2",
			activationBkgColor: "#fff0f6",
			sequenceNumberColor: "#6b3550",
		};
	}

	function normalizeMermaidCode(rawCode) {
		if (typeof rawCode !== "string") {
			return "";
		}

		const trimmed = rawCode.trim();
		const initMatch = trimmed.match(/^%%\{init:\s*([\s\S]*?)\}\s*%%\s*/);
		if (!initMatch) {
			return trimmed;
		}

		const originalConfig = initMatch[1];
		const remainingCode = trimmed.slice(initMatch[0].length).trimStart();

		try {
			const parsed = JSON.parse(originalConfig);
			delete parsed.theme;
			delete parsed.themeVariables;

			if (Object.keys(parsed).length === 0) {
				return remainingCode;
			}

			return `%%{init: ${JSON.stringify(parsed)}}%%\n${remainingCode}`;
		} catch (error) {
			console.warn("[mermaid] failed to parse init block, dropping it for stable theme rendering", error);
			return remainingCode;
		}
	}

	function ensureLightbox() {
		if (state.lightbox) {
			return state.lightbox;
		}

		const overlay = document.createElement("div");
		overlay.className = "mermaid-lightbox";
		overlay.setAttribute("hidden", "");
		overlay.innerHTML = `
			<div class="mermaid-lightbox__backdrop" data-mermaid-lightbox-close></div>
			<div class="mermaid-lightbox__dialog" role="dialog" aria-modal="true" aria-label="Mermaid diagram preview">
				<button type="button" class="mermaid-lightbox__close" data-mermaid-lightbox-close aria-label="Close diagram preview">×</button>
				<div class="mermaid-lightbox__stage"></div>
			</div>
		`;

		const close = () => {
			overlay.setAttribute("hidden", "");
			document.documentElement.classList.remove("mermaid-lightbox-open");
			document.body.classList.remove("mermaid-lightbox-open");
		};

		overlay.addEventListener("click", (event) => {
			if (event.target instanceof Element && event.target.closest("[data-mermaid-lightbox-close]")) {
				close();
			}
		});

		document.addEventListener("keydown", (event) => {
			if (event.key === "Escape" && !overlay.hasAttribute("hidden")) {
				close();
			}
		});

		document.body.appendChild(overlay);
		state.lightbox = {
			overlay,
			stage: overlay.querySelector(".mermaid-lightbox__stage"),
			close,
		};

		return state.lightbox;
	}

	function openLightbox(sourceSvg) {
		const lightbox = ensureLightbox();
		if (!(lightbox.stage instanceof HTMLElement) || !(sourceSvg instanceof SVGElement)) {
			return;
		}

		lightbox.stage.innerHTML = "";
		const clone = sourceSvg.cloneNode(true);
		clone.removeAttribute("height");
		clone.setAttribute("width", "100%");
		lightbox.stage.appendChild(clone);
		lightbox.overlay.removeAttribute("hidden");
		document.documentElement.classList.add("mermaid-lightbox-open");
		document.body.classList.add("mermaid-lightbox-open");
	}

	function attachPreviewBehavior(element, svgElement) {
		if (element.__owenMermaidPreviewBound) {
			return;
		}

		element.__owenMermaidPreviewBound = true;
		element.classList.add("is-rendered");
		element.setAttribute("role", "button");
		element.setAttribute("tabindex", "0");
		element.setAttribute("aria-label", "点击放大 Mermaid 图表");

		const open = () => openLightbox(svgElement);
		element.addEventListener("click", open);
		element.addEventListener("keydown", (event) => {
			if (event.key === "Enter" || event.key === " ") {
				event.preventDefault();
				open();
			}
		});
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
			const themeKey = isDark ? "dark" : "light";
			state.currentTheme = themeKey;

			window.mermaid.initialize({
				startOnLoad: false,
				theme: "base",
				themeVariables: getThemeVariables(isDark),
				securityLevel: "loose",
				errorLevel: "warn",
				logLevel: "error",
			});

			for (let index = 0; index < targets.length; index += 1) {
				const element = targets[index];
				const code = element.getAttribute("data-mermaid-code") || "";
				const normalizedCode = normalizeMermaidCode(code);
				const signature = `${themeKey}:${normalizedCode}`;

				if (element.dataset.mermaidSignature === signature && element.querySelector("svg")) {
					continue;
				}

				element.classList.remove("is-rendered");
				element.innerHTML = '<div class="mermaid-loading">Rendering diagram...</div>';

				try {
					const { svg } = await window.mermaid.render(`owen-mermaid-${Date.now()}-${index}`, normalizedCode);
					const parser = new DOMParser();
					const doc = parser.parseFromString(svg, "image/svg+xml");
					const svgElement = doc.documentElement;

					element.innerHTML = "";
					element.__owenMermaidPreviewBound = false;
					element.appendChild(svgElement);
					element.dataset.mermaidSignature = signature;

					const insertedSvg = element.querySelector("svg");
					if (insertedSvg) {
						insertedSvg.setAttribute("width", "100%");
						insertedSvg.removeAttribute("height");
						insertedSvg.style.maxWidth = "100%";
						insertedSvg.style.height = "auto";
						insertedSvg.style.minHeight = "0";
						insertedSvg.style.display = "block";
						insertedSvg.style.filter = "none";
						attachPreviewBehavior(element, insertedSvg);
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

	function scheduleRender(delay) {
		window.clearTimeout(window.__owenMermaidRenderTimer);
		window.__owenMermaidRenderTimer = window.setTimeout(() => {
			renderMermaidDiagrams();
		}, delay);
	}

	function setupObservers() {
		const observer = new MutationObserver((mutations) => {
			for (const mutation of mutations) {
				if (mutation.type === "attributes" && mutation.attributeName === "class") {
					const isDark = document.documentElement.classList.contains("dark");
					const nextTheme = isDark ? "dark" : "light";
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

		document.addEventListener("astro:page-load", () => scheduleRender(50));
		document.addEventListener("pageshow", () => scheduleRender(50));
		document.addEventListener("visibilitychange", () => {
			if (!document.hidden) {
				scheduleRender(80);
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

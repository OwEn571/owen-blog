(() => {
	// 单例模式：检查是否已经初始化过
	if (window.mermaidInitialized) {
		// 如果已经初始化过，只确保 renderMermaidDiagrams 函数可用
		if (typeof window.renderMermaidDiagrams !== "function") {
			window.renderMermaidDiagrams = renderMermaidDiagrams;
		}
		return;
	}

	window.mermaidInitialized = true;

	// 记录当前主题状态，避免不必要的重新渲染
	let currentTheme = null;
	let isRendering = false; // 防止并发渲染
	let retryCount = 0;
	const MAX_RETRIES = 3;
	const RETRY_DELAY = 1000; // 1秒
	let lightbox = null;

	function getMermaidThemeVariables(isDark) {
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

	function ensureLightbox() {
		if (lightbox) {return lightbox;}

		const overlay = document.createElement("div");
		overlay.className = "mermaid-lightbox";
		overlay.setAttribute("hidden", "");
		overlay.innerHTML = `
			<div class="mermaid-lightbox__backdrop" data-mermaid-lightbox-close></div>
			<div class="mermaid-lightbox__dialog" role="dialog" aria-modal="true" aria-label="Mermaid Diagram Preview">
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
			if ((event.target instanceof Element) && event.target.closest("[data-mermaid-lightbox-close]")) {
				close();
			}
		});

		document.addEventListener("keydown", (event) => {
			if (event.key === "Escape" && !overlay.hasAttribute("hidden")) {
				close();
			}
		});

		document.body.appendChild(overlay);
		lightbox = {
			overlay,
			stage: overlay.querySelector(".mermaid-lightbox__stage"),
			close,
		};
		return lightbox;
	}

	function openLightbox(sourceSvg) {
		const instance = ensureLightbox();
		if (!(instance?.stage instanceof HTMLElement) || !(sourceSvg instanceof SVGElement)) {
			return;
		}

		instance.stage.innerHTML = "";
		const clone = sourceSvg.cloneNode(true);
		clone.removeAttribute("height");
		clone.setAttribute("width", "100%");
		instance.stage.appendChild(clone);
		instance.overlay.removeAttribute("hidden");
		document.documentElement.classList.add("mermaid-lightbox-open");
		document.body.classList.add("mermaid-lightbox-open");
	}

	// 检查主题是否真的发生了变化
	function hasThemeChanged() {
		const isDark = document.documentElement.classList.contains("dark");
		const newTheme = isDark ? "dark" : "default";

		if (currentTheme !== newTheme) {
			currentTheme = newTheme;
			return true;
		}
		return false;
	}

	// 等待 Mermaid 库加载完成
	function waitForMermaid(timeout = 10000) {
		return new Promise((resolve, reject) => {
			const startTime = Date.now();

			function check() {
				if (
					window.mermaid &&
					typeof window.mermaid.initialize === "function"
				) {
					resolve(window.mermaid);
				} else if (Date.now() - startTime > timeout) {
					reject(
						new Error(
							"Mermaid library failed to load within timeout",
						),
					);
				} else {
					setTimeout(check, 100);
				}
			}

			check();
		});
	}

	// 设置 MutationObserver 监听 html 元素的 class 属性变化
	function setupMutationObserver() {
		const observer = new MutationObserver((mutations) => {
			mutations.forEach((mutation) => {
				if (
					mutation.type === "attributes" &&
					mutation.attributeName === "class"
				) {
					// 检查是否是 dark 类的变化
					const target = mutation.target;
					const wasDark = mutation.oldValue
						? mutation.oldValue.includes("dark")
						: false;
					const isDark = target.classList.contains("dark");

					if (wasDark !== isDark) {
						if (hasThemeChanged()) {
							// 延迟渲染，避免主题切换时的闪烁
							setTimeout(() => renderMermaidDiagrams(), 150);
						}
					}
				}
			});
		});

		// 开始观察 html 元素的 class 属性变化
		observer.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ["class"],
			attributeOldValue: true,
		});
	}

	function attachPreviewBehavior(element, svgElement) {
		if (element.__previewAttached) {return;}
		element.__previewAttached = true;
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

	// 设置其他事件监听器
	function setupEventListeners() {
		// 监听页面切换
		document.addEventListener("astro:page-load", () => {
			// 重新初始化主题状态
			currentTheme = null;
			retryCount = 0; // 重置重试计数
			if (hasThemeChanged()) {
				setTimeout(() => renderMermaidDiagrams(), 100);
			}
		});

		// 监听页面可见性变化，页面重新可见时重新渲染
		document.addEventListener("visibilitychange", () => {
			if (!document.hidden) {
				setTimeout(() => renderMermaidDiagrams(), 200);
			}
		});
	}

	async function initializeMermaid() {
		try {
			await waitForMermaid();

			// 初始化 Mermaid 配置
			window.mermaid.initialize({
				startOnLoad: false,
				theme: "base",
				themeVariables: getMermaidThemeVariables(document.documentElement.classList.contains("dark")),
				securityLevel: "loose",
				errorLevel: "warn",
				logLevel: "error",
			});

			// 渲染所有 Mermaid 图表
			await renderMermaidDiagrams();
		} catch (error) {
			console.error("Failed to initialize Mermaid:", error);
			// 如果初始化失败，尝试重新加载
			if (retryCount < MAX_RETRIES) {
				retryCount++;
				setTimeout(() => initializeMermaid(), RETRY_DELAY * retryCount);
			}
		}
	}

	async function renderMermaidDiagrams() {
		// 防止并发渲染
		if (isRendering) {
			return;
		}

		// 检查 Mermaid 是否可用
		if (!window.mermaid || typeof window.mermaid.render !== "function") {
			console.warn("Mermaid not available, skipping render");
			return;
		}

		isRendering = true;

		try {
			const mermaidElements = document.querySelectorAll(
				".mermaid[data-mermaid-code]",
			);

			if (mermaidElements.length === 0) {
				isRendering = false;
				return;
			}

			// 延迟检测主题，确保 DOM 已经更新
			await new Promise((resolve) => setTimeout(resolve, 100));

			const htmlElement = document.documentElement;
			const isDark = htmlElement.classList.contains("dark");
			window.mermaid.initialize({
				startOnLoad: false,
				theme: "base",
				themeVariables: getMermaidThemeVariables(isDark),
				securityLevel: "loose",
				errorLevel: "warn",
				logLevel: "error",
			});

			// 批量渲染所有图表，添加重试机制
			const renderPromises = Array.from(mermaidElements).map(
				async (element, index) => {
					let attempts = 0;
					const maxAttempts = 3;

					while (attempts < maxAttempts) {
						try {
							const code =
								element.getAttribute("data-mermaid-code");

							if (!code) {
								break;
							}

							// 显示加载状态
							element.innerHTML =
								'<div class="mermaid-loading">Rendering diagram...</div>';

							// 渲染图表
							const { svg } = await window.mermaid.render(
								`mermaid-${Date.now()}-${index}-${attempts}`,
								code,
							);

							const parser = new DOMParser();
							const doc = parser.parseFromString(
								svg,
								"image/svg+xml",
							);
							const svgElement = doc.documentElement;

							element.innerHTML = "";
							element.__zoomAttached = false;
							element.appendChild(svgElement);

							// 添加响应式支持
							const insertedSvg = element.querySelector("svg");
							if (insertedSvg) {
								insertedSvg.setAttribute("width", "100%");
								insertedSvg.removeAttribute("height");
								insertedSvg.style.maxWidth = "100%";
								insertedSvg.style.height = "auto";
								insertedSvg.style.minHeight = "0";
								svgElement.style.filter = "none";
								attachPreviewBehavior(element, insertedSvg);
							}

							// 渲染成功，跳出重试循环
							break;
						} catch (error) {
							attempts++;
							console.warn(
								`Mermaid rendering attempt ${attempts} failed for element ${index}:`,
								error,
							);

							if (attempts >= maxAttempts) {
								console.error(
									`Failed to render Mermaid diagram after ${maxAttempts} attempts:`,
									error,
								);
								element.innerHTML = `
									<div class="mermaid-error">
										<p>Failed to render diagram after ${maxAttempts} attempts.</p>
										<button onclick="location.reload()" style="margin-top: 8px; padding: 4px 8px; background: var(--primary); color: white; border: none; border-radius: 4px; cursor: pointer;">
											Retry Page
										</button>
									</div>
								`;
							} else {
								// 等待一段时间后重试
								await new Promise((resolve) =>
									setTimeout(resolve, 500 * attempts),
								);
							}
						}
					}
				},
			);

			// 等待所有渲染完成
			await Promise.all(renderPromises);
			retryCount = 0; // 重置重试计数
		} catch (error) {
			console.error("Error in renderMermaidDiagrams:", error);

			// 如果渲染失败，尝试重新渲染
			if (retryCount < MAX_RETRIES) {
				retryCount++;
				setTimeout(
					() => renderMermaidDiagrams(),
					RETRY_DELAY * retryCount,
				);
			}
		} finally {
			isRendering = false;
		}
	}

	// 初始化主题状态
	function initializeThemeState() {
		const isDark = document.documentElement.classList.contains("dark");
		currentTheme = isDark ? "dark" : "default";
	}

	// 加载 Mermaid 库
	async function loadMermaid() {
		if (typeof window.mermaid !== "undefined") {
			return Promise.resolve();
		}

		return new Promise((resolve, reject) => {
			const script = document.createElement("script");
			script.src =
				"https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js";

			script.onload = () => {
				console.log("Mermaid library loaded successfully");
				resolve();
			};

			script.onerror = (error) => {
				console.error("Failed to load Mermaid library:", error);
				// 尝试备用 CDN
				const fallbackScript = document.createElement("script");
				fallbackScript.src =
					"https://unpkg.com/mermaid@11/dist/mermaid.min.js";

				fallbackScript.onload = () => {
					console.log("Mermaid library loaded from fallback CDN");
					resolve();
				};

				fallbackScript.onerror = () => {
					reject(
						new Error(
							"Failed to load Mermaid from both primary and fallback CDNs",
						),
					);
				};

				document.head.appendChild(fallbackScript);
			};

			document.head.appendChild(script);
		});
	}

	// 主初始化函数
	async function initialize() {
		try {
			// 设置监听器
			setupMutationObserver();
			setupEventListeners();

			// 初始化主题状态
			initializeThemeState();

			// 加载并初始化 Mermaid
			await loadMermaid();
			await initializeMermaid();

			// 将 renderMermaidDiagrams 暴露到全局作用域，以便在解密后调用
			window.renderMermaidDiagrams = renderMermaidDiagrams;
		} catch (error) {
			console.error("Failed to initialize Mermaid system:", error);
		}
	}

	// 启动初始化
	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", initialize);
	} else {
		initialize();
	}
})();

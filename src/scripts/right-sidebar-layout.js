// 右侧边栏布局管理器
// 用于在网格模式下隐藏右侧边栏

const layoutWindow = typeof window !== "undefined" ? window : null;
const layoutDocument = typeof document !== "undefined" ? document : null;
const layoutState =
	layoutWindow?.__owenRightSidebarLayoutState ||
	(layoutWindow
		? (layoutWindow.__owenRightSidebarLayoutState = {
				listenersBound: false,
			})
		: {
				listenersBound: false,
			});

function getPreferredLayout() {
	try {
		return localStorage.getItem("postListLayout") || "list";
	} catch {
		return "list";
	}
}

function applyStoredLayout() {
	if (getPreferredLayout() === "grid") {
		hideRightSidebar();
		return;
	}

	showRightSidebar();
}

function bindGlobalListeners() {
	if (!layoutWindow || !layoutDocument || layoutState.listenersBound) {
		return;
	}

	layoutState.listenersBound = true;
	layoutWindow.addEventListener("layoutChange", (event) => {
		const layout = event.detail.layout;
		if (layout === "grid") {
			hideRightSidebar();
		} else {
			showRightSidebar();
		}
	});

	layoutWindow.addEventListener("storage", (event) => {
		if (event.key === "postListLayout") {
			applyStoredLayout();
		}
	});

	const scheduleApplyStoredLayout = () => {
		layoutWindow.setTimeout(() => {
			applyStoredLayout();
		}, 100);
	};

	layoutDocument.addEventListener("astro:page-load", scheduleApplyStoredLayout);
	layoutDocument.addEventListener("swup:contentReplaced", scheduleApplyStoredLayout);
	layoutDocument.addEventListener("swup:page:view", scheduleApplyStoredLayout);
	layoutDocument.addEventListener("owen-blog:page:loaded", scheduleApplyStoredLayout);
}

/**
 * 初始化页面布局
 * @param {string} pageType - 页面类型（projects, skills等）
 */
function initPageLayout(pageType) {
	void pageType;
	applyStoredLayout();
	bindGlobalListeners();
}

/**
 * 隐藏右侧边栏
 */
function hideRightSidebar() {
	const rightSidebar = document.querySelector(".right-sidebar-container");
	if (rightSidebar) {
		// 添加隐藏类
		rightSidebar.classList.add("hidden-in-grid-mode");

		// 设置显示为none以完全隐藏
		rightSidebar.style.display = "none";

		// 调整主网格布局
		const mainGrid = document.getElementById("main-grid");
		if (mainGrid) {
			mainGrid.style.gridTemplateColumns = "17.5rem 1fr";
			mainGrid.setAttribute("data-layout-mode", "grid");
		}
	}
}

/**
 * 显示右侧边栏
 */
function showRightSidebar() {
	const rightSidebar = document.querySelector(".right-sidebar-container");
	if (rightSidebar) {
		// 移除隐藏类
		rightSidebar.classList.remove("hidden-in-grid-mode");

		// 恢复显示
		rightSidebar.style.display = "";

		// 恢复主网格布局
		const mainGrid = document.getElementById("main-grid");
		if (mainGrid) {
			mainGrid.style.gridTemplateColumns = "";
			mainGrid.setAttribute("data-layout-mode", "list");
		}
	}
}

// 页面加载完成后初始化
function initialize() {
	const pageType =
		document.documentElement.getAttribute("data-page-type") || "projects";
	initPageLayout(pageType);
}

if (document.readyState === "loading") {
	document.addEventListener("DOMContentLoaded", initialize);
} else {
	initialize();
}

// 导出函数供其他脚本使用
if (typeof module !== "undefined" && module.exports) {
	module.exports = {
		initPageLayout,
		hideRightSidebar,
		showRightSidebar,
	};
}

// 同时也挂载到 window 对象，以便在浏览器环境中直接调用
if (typeof window !== "undefined") {
	window.rightSidebarLayout = {
		initPageLayout,
		hideRightSidebar,
		showRightSidebar,
	};
}

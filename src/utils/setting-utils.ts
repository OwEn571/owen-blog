import {
	DARK_MODE,
	DEFAULT_THEME,
	LIGHT_MODE,
	SYSTEM_MODE,
	// WALLPAPER_BANNER,
} from "@constants/constants";

import { siteConfig } from "@/config";
import type { LIGHT_DARK_MODE, WALLPAPER_MODE } from "@/types/config";

function normalizeTheme(theme: string | null | undefined): LIGHT_DARK_MODE {
	switch (theme) {
		case LIGHT_MODE:
		case DARK_MODE:
		case SYSTEM_MODE:
			return theme;
		default:
			return DEFAULT_THEME;
	}
}

function resolveThemeDark(theme: LIGHT_DARK_MODE): boolean {
	switch (theme) {
		case LIGHT_MODE:
			return false;
		case DARK_MODE:
			return true;
		case SYSTEM_MODE:
		default:
			return window.matchMedia("(prefers-color-scheme: dark)").matches;
	}
}

export function getDefaultHue(): number {
	const fallback = "250";
	const configCarrier = document.getElementById("config-carrier");
	// 在Swup页面切换时，config-carrier可能不存在，使用默认值
	if (!configCarrier) {
		return Number.parseInt(fallback);
	}
	return Number.parseInt(configCarrier.dataset.hue || fallback);
}

export function getHue(): number {
	const stored = localStorage.getItem("hue");
	return stored ? Number.parseInt(stored) : getDefaultHue();
}

export function setHue(hue: number): void {
	localStorage.setItem("hue", String(hue));
	const r = document.querySelector(":root") as HTMLElement;
	if (!r) {
		return;
	}
	r.style.setProperty("--hue", String(hue));
}

export function applyThemeToDocument(theme: LIGHT_DARK_MODE) {
	type ThemeTransitionWindow = Window & {
		__owenThemeChangeTimer?: number;
		__owenThemeEndTimer?: number;
		__owenThemeSafetyTimer?: number;
	};

	const themedWindow = window as ThemeTransitionWindow;
	const currentIsDark = document.documentElement.classList.contains("dark");
	const currentTheme = document.documentElement.getAttribute("data-theme");
	const targetIsDark = resolveThemeDark(theme);
	const needsThemeChange = currentIsDark !== targetIsDark;
	const expectedTheme = targetIsDark ? "github-dark" : "github-light";
	const needsCodeThemeUpdate = currentTheme !== expectedTheme;
	if (!needsThemeChange && !needsCodeThemeUpdate) {
		return;
	}

	const performThemeChange = () => {
		if (needsThemeChange) {
			if (targetIsDark) {
				document.documentElement.classList.add("dark");
			} else {
				document.documentElement.classList.remove("dark");
			}
		}

		if (needsCodeThemeUpdate) {
			const expressiveTheme = targetIsDark
				? "github-dark"
				: "github-light";
			document.documentElement.setAttribute(
				"data-theme",
				expressiveTheme,
			);
		}
		window.dispatchEvent(
			new CustomEvent("owen:theme-applied", {
				detail: { theme, dark: targetIsDark },
			}),
		);
	};

	const prefersReducedMotion = window.matchMedia(
		"(prefers-reduced-motion: reduce)",
	).matches;

	const finishThemeTransition = () => {
		document.documentElement.classList.remove("is-theme-transitioning");
		window.dispatchEvent(
			new CustomEvent("owen:theme-transition", {
				detail: { phase: "end", theme, dark: targetIsDark },
			}),
		);
	};

	window.clearTimeout(themedWindow.__owenThemeChangeTimer);
	window.clearTimeout(themedWindow.__owenThemeEndTimer);
	window.clearTimeout(themedWindow.__owenThemeSafetyTimer);
	document.documentElement.classList.add("is-theme-transitioning");
	window.dispatchEvent(
		new CustomEvent("owen:theme-transition", {
			detail: { phase: "start", theme, dark: targetIsDark },
		}),
	);

	if (prefersReducedMotion || !needsThemeChange) {
		performThemeChange();
		requestAnimationFrame(() => {
			finishThemeTransition();
		});
		return;
	}

	themedWindow.__owenThemeChangeTimer = window.setTimeout(() => {
		performThemeChange();
	}, 210);

	themedWindow.__owenThemeEndTimer = window.setTimeout(() => {
		finishThemeTransition();
	}, 760);

	themedWindow.__owenThemeSafetyTimer = window.setTimeout(() => {
		finishThemeTransition();
	}, 1250);
}

export function setTheme(theme: LIGHT_DARK_MODE): void {
	type ThemeWindow = Window & {
		__owenApplyTheme?: (theme: LIGHT_DARK_MODE) => void;
	};

	if (typeof window !== "undefined") {
		const themedWindow = window as ThemeWindow;
		if (typeof themedWindow.__owenApplyTheme === "function") {
			themedWindow.__owenApplyTheme(theme);
			return;
		}
	}

	localStorage.setItem("theme", theme);
	applyThemeToDocument(theme);
}

export function getStoredTheme(): LIGHT_DARK_MODE {
	return normalizeTheme(localStorage.getItem("theme"));
}

export function getStoredWallpaperMode(): WALLPAPER_MODE {
	return (
		(localStorage.getItem("wallpaperMode") as WALLPAPER_MODE) ||
		siteConfig.wallpaperMode.defaultMode
	);
}

export function setWallpaperMode(mode: WALLPAPER_MODE): void {
	localStorage.setItem("wallpaperMode", mode);
	// 触发自定义事件通知其他组件壁纸模式已改变
	window.dispatchEvent(
		new CustomEvent("wallpaper-mode-change", { detail: { mode } }),
	);
}

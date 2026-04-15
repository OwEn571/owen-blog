/**
 * 返回顶部处理器
 * 管理返回顶部按钮和滚动监听
 */

import {
	BANNER_HEIGHT,
	BANNER_HEIGHT_HOME,
	SCROLL_CONFIG,
	SWUP_SELECTORS,
} from '../core/swup-config';
import { ScrollHandler } from './scroll-handler';

/**
 * 返回顶部处理器类
 * 负责返回顶部按钮的显示/隐藏和滚动位置监听
 */
export class BackToTopHandler {
	private backToTopBtn: HTMLElement | null = null;
	private toc: HTMLElement | null = null;
	private navbar: HTMLElement | null = null;
	private bannerEnabled: boolean;
	private scrollHandler: () => void;
	private resizeHandler: () => void;
	private pageViewHandler: () => void;
	private layoutChangeHandler: () => void;
	private bannerHeightPx = 0;
	private showBackToTopThreshold = 0;
	private navbarHideThreshold = 0;
	private lastBackToTopVisible: boolean | null = null;
	private lastTOCVisible: boolean | null = null;
	private lastNavbarHidden: boolean | null = null;
	private pendingFrame: number | null = null;

	constructor(bannerEnabled: boolean) {
		this.bannerEnabled = bannerEnabled;
		this.scrollHandler = ScrollHandler.throttle(
			this.handleScroll.bind(this),
			SCROLL_CONFIG.throttleInterval
		);
		this.resizeHandler = this.handleResize.bind(this);
		this.pageViewHandler = this.handlePageView.bind(this);
		this.layoutChangeHandler = this.handleLayoutChange.bind(this);
	}

	/**
	 * 初始化返回顶部处理器
	 */
	init(): void {
		this.cacheElements();
		this.updateMetrics();
		this.bindEvents();
		this.syncVisibility();
	}

	/**
	 * 缓存 DOM 元素
	 */
	private cacheElements(): void {
		this.backToTopBtn = document.getElementById(
			SWUP_SELECTORS.backToTopBtn.slice(1)
		);
		this.toc = document.getElementById(SWUP_SELECTORS.tocWrapper.slice(1));
		this.navbar = document.getElementById(
			SWUP_SELECTORS.navbarWrapper.slice(1)
		);
	}

	/**
	 * 绑定事件监听
	 */
	private bindEvents(): void {
		window.removeEventListener('scroll', this.scrollHandler);
		window.removeEventListener('resize', this.resizeHandler);
		window.removeEventListener('wallpaper-mode-change', this.layoutChangeHandler);
		document.removeEventListener('swup:page:view', this.pageViewHandler);
		window.addEventListener('scroll', this.scrollHandler, { passive: true });
		window.addEventListener('resize', this.resizeHandler, { passive: true });
		window.addEventListener('wallpaper-mode-change', this.layoutChangeHandler);
		document.addEventListener('swup:page:view', this.pageViewHandler);
	}

	/**
	 * 处理滚动事件
	 */
	private handleScroll(): void {
		if (this.pendingFrame !== null) {return;}

		this.pendingFrame = requestAnimationFrame(() => {
			this.pendingFrame = null;
			this.syncVisibility();
		});
	}

	/**
	 * 计算返回顶部按钮显示阈值
	 */
	private calculateShowThreshold(scrollTop: number): number {
		const contentWrapper = document.getElementById(
			SWUP_SELECTORS.contentWrapper.slice(1)
		);
		let threshold =
			window.innerHeight * (BANNER_HEIGHT / 100) +
			SCROLL_CONFIG.backToTopOffset;

		if (contentWrapper) {
			const rect = contentWrapper.getBoundingClientRect();
			const absoluteTop = rect.top + scrollTop;
			threshold = absoluteTop + window.innerHeight / 4;
		}

		return threshold;
	}

	/**
	 * 更新滚动相关阈值，避免在滚动过程中反复触发布局测量
	 */
	private updateMetrics(): void {
		const scrollTop = document.documentElement.scrollTop || window.scrollY || 0;
		const isHome =
			document.body.classList.contains('lg:is-home') &&
			window.innerWidth >= 1280;
		const currentBannerHeight = isHome
			? BANNER_HEIGHT_HOME
			: BANNER_HEIGHT;

		this.bannerHeightPx = window.innerHeight * (BANNER_HEIGHT / 100);
		this.showBackToTopThreshold = this.calculateShowThreshold(scrollTop);
		this.navbarHideThreshold =
			window.innerHeight * (currentBannerHeight / 100) -
			SCROLL_CONFIG.navbarHideOffset;
	}

	/**
	 * 同步按钮、TOC 和 Navbar 的可见状态
	 */
	private syncVisibility(): void {
		const scrollTop = document.documentElement.scrollTop || window.scrollY || 0;

		this.updateBackToTopButton(scrollTop);
		this.updateTOCVisibility(scrollTop);
		this.updateNavbarVisibility(scrollTop);
	}

	/**
	 * 更新返回顶部按钮可见性
	 */
	private updateBackToTopButton(scrollTop: number): void {
		if (!this.backToTopBtn) {return;}

		const shouldShow = scrollTop > this.showBackToTopThreshold;
		if (this.lastBackToTopVisible === shouldShow) {return;}

		this.backToTopBtn.classList.toggle('hide', !shouldShow);
		this.lastBackToTopVisible = shouldShow;
	}

	/**
	 * 更新 TOC 可见性
	 */
	private updateTOCVisibility(scrollTop: number): void {
		if (!this.bannerEnabled || !this.toc) {return;}

		const isBannerMode =
			document.body.classList.contains('enable-banner');
		const shouldShow = !isBannerMode || scrollTop > this.bannerHeightPx;

		if (this.lastTOCVisible === shouldShow) {return;}

		this.toc.classList.toggle('toc-hide', !shouldShow);
		this.lastTOCVisible = shouldShow;
	}

	/**
	 * 更新 Navbar 可见性
	 */
	private updateNavbarVisibility(scrollTop: number): void {
		if (!this.bannerEnabled || !this.navbar) {return;}

		const shouldHide = scrollTop >= this.navbarHideThreshold;
		if (this.lastNavbarHidden === shouldHide) {return;}

		this.navbar.classList.toggle('navbar-hidden', shouldHide);
		this.lastNavbarHidden = shouldHide;
	}

	/**
	 * 处理窗口大小变化
	 */
	private handleResize(): void {
		// 计算 --banner-height-extend
		// 需要是 4 的倍数以避免模糊文本
		let offset = Math.floor(
			window.innerHeight * (30 / 100) // BANNER_HEIGHT_EXTEND
		);
		offset = offset - (offset % 4);
		document.documentElement.style.setProperty(
			'--banner-height-extend',
			`${offset}px`
		);

		this.updateMetrics();
		this.syncVisibility();
	}

	/**
	 * 处理 Swup 页面切换后的重新计算
	 */
	private handlePageView(): void {
		this.bannerEnabled = !!document.getElementById(
			SWUP_SELECTORS.bannerWrapper.slice(1)
		);
		this.cacheElements();
		this.lastBackToTopVisible = null;
		this.lastTOCVisible = null;
		this.lastNavbarHidden = null;

		requestAnimationFrame(() => {
			this.updateMetrics();
			this.syncVisibility();
		});
	}

	/**
	 * 处理布局模式切换后的阈值刷新
	 */
	private handleLayoutChange(): void {
		requestAnimationFrame(() => {
			this.updateMetrics();
			this.syncVisibility();
		});
	}

	/**
	 * 销毁处理器
	 */
	destroy(): void {
		window.removeEventListener('scroll', this.scrollHandler);
		window.removeEventListener('resize', this.resizeHandler);
		window.removeEventListener('wallpaper-mode-change', this.layoutChangeHandler);
		document.removeEventListener('swup:page:view', this.pageViewHandler);
		if (this.pendingFrame !== null) {
			cancelAnimationFrame(this.pendingFrame);
			this.pendingFrame = null;
		}
		this.backToTopBtn = null;
		this.toc = null;
		this.navbar = null;
	}

	/**
	 * 更新 Banner 启用状态
	 */
	setBannerEnabled(enabled: boolean): void {
		this.bannerEnabled = enabled;
		this.updateMetrics();
		this.syncVisibility();
	}
}

// 创建全局实例
let globalBackToTopHandler: BackToTopHandler | null = null;

/**
 * 获取全局返回顶部处理器实例
 */
export function getBackToTopHandler(bannerEnabled: boolean): BackToTopHandler {
	if (!globalBackToTopHandler) {
		globalBackToTopHandler = new BackToTopHandler(bannerEnabled);
	}
	return globalBackToTopHandler;
}

/**
 * 初始化返回顶部处理器（便捷函数）
 */
export function initBackToTopHandler(bannerEnabled: boolean): void {
	const handler = getBackToTopHandler(bannerEnabled);
	handler.init();
}

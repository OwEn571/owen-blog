<script lang="ts">
import I18nKey from "@i18n/i18nKey";
import { i18n } from "@i18n/translation";
import Icon from "@iconify/svelte";
import { navigateToPage } from "@utils/navigation-utils";
import { url } from "@utils/url-utils";
import { onDestroy,onMount } from "svelte";

import type { SearchResult } from "@/global";

let keywordDesktop = $state("");
let keywordMobile = $state("");
let result: SearchResult[] = $state([]);
let pagefindLoaded = false;
let initialized = $state(false);
let isDesktopSearchExpanded = $state(false);
let debounceTimer: NodeJS.Timeout;
let windowJustFocused = false;
let focusTimer: NodeJS.Timeout;
let blurTimer: NodeJS.Timeout;

const fakeResult: SearchResult[] = [
	{
		url: url("/"),
		meta: {
			title: "This Is a Fake Search Result",
		},
		excerpt:
			"Because the search cannot work in the <mark>dev</mark> environment.",
	},
	{
		url: url("/"),
		meta: {
			title: "If You Want to Test the Search",
		},
		excerpt: "Try running <mark>npm build && npm preview</mark> instead.",
	},
];

const toggleDesktopSearch = () => {
	// 如果窗口刚获得焦点，不自动展开搜索框
	if (windowJustFocused) {
		return;
	}
	isDesktopSearchExpanded = !isDesktopSearchExpanded;
	if (isDesktopSearchExpanded) {
		focusDesktopInput();
	}
};

const focusDesktopInput = () => {
	setTimeout(() => {
		const input = document.getElementById(
			"search-input-desktop",
		) as HTMLInputElement;
		input?.focus();
	}, 0);
};

const collapseDesktopSearch = () => {
	if (!keywordDesktop) {
		isDesktopSearchExpanded = false;
	}
};

const handleBlur = () => {
	// 延迟处理以允许搜索结果的点击事件先于折叠逻辑执行
	blurTimer = setTimeout(() => {
		isDesktopSearchExpanded = false;
		// 仅隐藏面板并折叠，保留搜索关键词和结果以便下次展开时查看
		setPanelVisibility(false, true);
	}, 200);
};

const setPanelVisibility = (show: boolean, isDesktop: boolean): void => {
	const panel = document.getElementById("search-panel");
	if (!panel || !isDesktop) {return;}
	if (show) {
		panel.classList.remove("float-panel-closed");
	} else {
		panel.classList.add("float-panel-closed");
	}
};

const closeSearchPanel = (): void => {
	const panel = document.getElementById("search-panel");
	if (panel) {
		panel.classList.add("float-panel-closed");
	}
	// 清空搜索关键词和结果
	keywordDesktop = "";
	keywordMobile = "";
	result = [];
};

const handleResultClick = (event: Event, url: string): void => {
	event.preventDefault();
	closeSearchPanel();
	navigateToPage(url);
};

const search = async (keyword: string, isDesktop: boolean): Promise<void> => {
	if (!keyword) {
		setPanelVisibility(false, isDesktop);
		result = [];
		return;
	}
	if (!initialized) {
		return;
	}
	try {
		let searchResults: SearchResult[] = [];
		if (import.meta.env.PROD && pagefindLoaded && window.pagefind) {
			const response = await window.pagefind.search(keyword);
			searchResults = await Promise.all(
				response.results.map((item) => item.data()),
			);
		} else if (import.meta.env.DEV) {
			searchResults = fakeResult;
		} else {
			searchResults = [];
			console.error("Pagefind is not available in production environment.");
		}
		result = searchResults;
		setPanelVisibility(result.length > 0, isDesktop);
	} catch (error) {
		console.error("Search error:", error);
		result = [];
		setPanelVisibility(false, isDesktop);
	}
};

onMount(() => {
	const initializeSearch = () => {
		initialized = true;
		pagefindLoaded =
			typeof window !== "undefined" &&
			!!window.pagefind &&
			typeof window.pagefind.search === "function";
		console.log("Pagefind status on init:", pagefindLoaded);
	};
	if (import.meta.env.DEV) {
		console.log(
			"Pagefind is not available in development mode. Using mock data.",
		);
		initializeSearch();
	} else {
		document.addEventListener("pagefindready", () => {
			console.log("Pagefind ready event received.");
			initializeSearch();
		});
		document.addEventListener("pagefindloaderror", () => {
			console.warn(
				"Pagefind load error event received. Search functionality will be limited.",
			);
			initializeSearch(); // Initialize with pagefindLoaded as false
		});
		// Fallback in case events are not caught or pagefind is already loaded by the time this script runs
		setTimeout(() => {
			if (!initialized) {
				console.log("Fallback: Initializing search after timeout.");
				initializeSearch();
			}
		}, 2000); // Adjust timeout as needed
	}

	// 监听窗口焦点事件，防止切换窗口时自动展开搜索框
	const handleFocus = () => {
		windowJustFocused = true;
		clearTimeout(focusTimer);
		focusTimer = setTimeout(() => {
			windowJustFocused = false;
		}, 500); // 500ms 后才允许 mouseenter 触发展开
	};

	window.addEventListener('focus', handleFocus);

	return () => {
		window.removeEventListener('focus', handleFocus);
	};
});

$effect(() => {
	if (initialized) {
		const keyword = keywordDesktop || keywordMobile;
		const isDesktop = !!keywordDesktop || isDesktopSearchExpanded;

		clearTimeout(debounceTimer);
		if (keyword) {
			debounceTimer = setTimeout(() => {
				search(keyword, isDesktop);
			}, 300);
		} else {
			result = [];
			setPanelVisibility(false, isDesktop);
		}
	}
});

$effect(() => {
	if (typeof document !== 'undefined') {
		const navbar = document.getElementById('navbar');
		if (isDesktopSearchExpanded) {
			navbar?.classList.add('is-searching');
		} else {
			navbar?.classList.remove('is-searching');
		}
	}
});

onDestroy(() => {
	if (typeof document !== 'undefined') {
		const navbar = document.getElementById('navbar');
		navbar?.classList.remove('is-searching');
	}
	clearTimeout(debounceTimer);
	clearTimeout(focusTimer);
});
</script>

<!-- search bar for desktop view (collapsed by default) -->
<div class="hidden lg:block relative w-11 h-11 shrink-0">
    <div
        id="search-bar"
        class="owen-search-shell flex transition-all items-center h-11 rounded-xl absolute right-0 top-0 shrink-0
            {isDesktopSearchExpanded ? 'bg-black/[0.04] hover:bg-black/[0.06] focus-within:bg-black/[0.06] dark:bg-white/5 dark:hover:bg-white/10 dark:focus-within:bg-white/10' : 'btn-plain active:scale-90'}
            {isDesktopSearchExpanded ? 'w-48' : 'w-11'}"
        role="search"
        aria-label="Desktop Search"
        onmouseenter={() => {if (!isDesktopSearchExpanded) {toggleDesktopSearch()}}}
        onmouseleave={collapseDesktopSearch}
    >
        <button
            type="button"
            class="owen-search-trigger absolute inset-y-0 left-0 z-[1] inline-flex w-11 items-center justify-center rounded-[inherit]"
            aria-label="Search"
            data-ui-control="desktop-search"
        >
            <Icon icon="material-symbols:search" class="text-[1.25rem] transition {isDesktopSearchExpanded ? 'text-black/30 dark:text-white/30' : ''}"></Icon>
        </button>
        <input id="search-input-desktop" placeholder={i18n(I18nKey.search)} bind:value={keywordDesktop}
            onfocus={() => {
                clearTimeout(blurTimer);
                if (!isDesktopSearchExpanded) {toggleDesktopSearch();} 
                search(keywordDesktop, true);
            }}
            onblur={handleBlur}
            class="owen-search-input transition-all pl-10 text-sm bg-transparent outline-0
                h-full {isDesktopSearchExpanded ? 'w-36' : 'w-0'} text-black/50 dark:text-white/50"
        >
    </div>
</div>

<!-- toggle btn for phone/tablet view -->
<button aria-label="Search Panel" id="search-switch" data-ui-control="search-panel"
        class="btn-plain scale-animation lg:!hidden rounded-lg w-11 h-11 active:scale-90">
    <Icon icon="material-symbols:search" class="text-[1.25rem]"></Icon>
</button>

<!-- search panel -->
<div id="search-panel" data-ui-panel="search-panel" class="float-panel float-panel-closed absolute md:w-[30rem] top-20 left-4 md:left-[unset] right-4 z-50 search-panel shadow-2xl rounded-2xl p-2">
    <!-- search bar inside panel for phone/tablet -->
    <div id="search-bar-inside" class="owen-search-inside flex relative lg:hidden transition-all items-center h-11 rounded-xl
      bg-black/[0.04] hover:bg-black/[0.06] focus-within:bg-black/[0.06]
      dark:bg-white/5 dark:hover:bg-white/10 dark:focus-within:bg-white/10
  ">
        <Icon icon="material-symbols:search" class="absolute text-[1.25rem] pointer-events-none ml-3 transition my-auto text-black/30 dark:text-white/30"></Icon>
        <input placeholder={i18n(I18nKey.search)} bind:value={keywordMobile}
               class="pl-10 absolute inset-0 text-sm bg-transparent outline-0
               focus:w-60 text-black/50 dark:text-white/50"
        >
    </div>
    <!-- search results -->
    {#each result as item}
        <a href={item.url}
           onclick={(e) => handleResultClick(e, item.url)}
           class="owen-search-result transition first-of-type:mt-2 lg:first-of-type:mt-0 group block
       rounded-xl text-lg px-3 py-2 hover:bg-[var(--btn-plain-bg-hover)] active:bg-[var(--btn-plain-bg-active)]">
            <div class="transition text-90 inline-flex font-bold group-hover:text-[var(--primary)]">
                {item.meta.title}<Icon icon="fa7-solid:chevron-right" class="transition text-[0.75rem] translate-x-1 my-auto text-[var(--primary)]"></Icon>
            </div>
            <div class="transition text-sm text-50">
                {@html item.excerpt}
            </div>
        </a>
    {/each}
</div>

<style>
    input:focus {
        outline: 0;
    }

    .owen-search-shell,
    .owen-search-inside,
    :global(.search-panel) {
        border: 1px solid rgba(118, 156, 255, 0.12);
        background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.54), rgba(247, 250, 255, 0.2)),
            radial-gradient(circle at top right, rgba(118, 156, 255, 0.1), transparent 12rem);
        box-shadow:
            0 18px 42px rgba(15, 23, 42, 0.08),
            inset 0 1px 0 rgba(255, 255, 255, 0.66);
        backdrop-filter: blur(18px) saturate(1.04);
        -webkit-backdrop-filter: blur(18px) saturate(1.04);
    }

    .owen-search-shell {
        overflow: hidden;
    }

    .owen-search-trigger {
        color: rgba(15, 23, 42, 0.42);
        transition: color 0.2s ease, transform 0.2s ease;
    }

    .owen-search-trigger:hover {
        color: var(--primary);
        transform: scale(1.03);
    }

    .owen-search-input {
        font-family: var(--owen-font-ui);
    }

    :global(.search-panel) {
        max-height: calc(100vh - 100px);
        overflow-y: auto;
        border-radius: 1.35rem;
        padding: 0.6rem;
    }

    .owen-search-result {
        border: 1px solid transparent;
        background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.36), rgba(255, 255, 255, 0.16)),
            radial-gradient(circle at top right, rgba(118, 156, 255, 0.05), transparent 8rem);
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.46);
    }

    .owen-search-result:hover {
        border-color: rgba(118, 156, 255, 0.14);
        box-shadow:
            0 16px 34px rgba(15, 23, 42, 0.06),
            0 0 14px rgba(118, 156, 255, 0.08),
            inset 0 1px 0 rgba(255, 255, 255, 0.6);
    }

    :global(:root:not(.dark) .search-panel),
    :global(:root:not(.dark) #search-bar),
    :global(:root:not(.dark) #search-bar-inside) {
        border-color: rgba(255, 191, 214, 0.18);
        background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.78), rgba(255, 243, 248, 0.56)),
            radial-gradient(circle at top right, rgba(255, 188, 210, 0.12), transparent 12rem);
        box-shadow:
            0 18px 42px rgba(176, 102, 136, 0.08),
            inset 0 1px 0 rgba(255, 255, 255, 0.8);
    }

    :global(:root:not(.dark) #search-bar .owen-search-trigger),
    :global(:root:not(.dark) #search-bar-inside .iconify) {
        color: rgba(181, 87, 127, 0.74);
    }

    :global(:root:not(.dark) .search-panel .owen-search-result) {
        background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.72), rgba(255, 243, 248, 0.42)),
            radial-gradient(circle at top right, rgba(255, 188, 210, 0.08), transparent 8rem);
    }

    :global(:root.dark .search-panel),
    :global(:root.dark #search-bar),
    :global(:root.dark #search-bar-inside) {
        border-color: rgba(255, 255, 255, 0.08);
        background:
            linear-gradient(180deg, rgba(12, 16, 25, 0.64), rgba(7, 10, 16, 0.34)),
            radial-gradient(circle at top right, rgba(118, 156, 255, 0.14), transparent 12rem);
        box-shadow:
            0 20px 46px rgba(0, 0, 0, 0.22),
            inset 0 1px 0 rgba(255, 255, 255, 0.08);
    }

    :global(:root.dark .search-panel .owen-search-result) {
        background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.02)),
            radial-gradient(circle at top right, rgba(118, 156, 255, 0.08), transparent 8rem);
    }
</style>

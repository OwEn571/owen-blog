<script lang="ts">
	import Icon from "@iconify/svelte";
	import { onMount } from "svelte";

	import I18nKey from "../../../i18n/i18nKey";
	import { i18n } from "../../../i18n/translation";
	import { navigateToPage } from "../../../utils/navigation-utils";
	import { panelManager } from "../../../utils/panel-manager.js";
	import { findTOCGroupParentId, groupTOCItems } from "./utils/toc-groups";
	import {
		checkIsHomePage,
		generatePostItems,
		generateTOCItems,
		getTOCConfig,
		type PostItem,
		scrollToHeading as scrollToHeadingUtil,
		type TOCItem,
	} from "./hooks/useMobileTOC";

	type TOCGroup = {
		parent: TOCItem;
		children: TOCItem[];
	};

	let tocItems: TOCItem[] = $state([]);
	let tocGroups: TOCGroup[] = $state([]);
	let manualExpandedGroups: string[] = $state([]);
	let manualCollapsedGroups: string[] = $state([]);
	let autoExpandedGroupId = $state("");
	let postItems: PostItem[] = $state([]);
	let activeId = $state("");
	let isHomePage = $state(false);

	let observer: IntersectionObserver | undefined;
	let swupListenersRegistered = $state(false);

	const togglePanel = async () => {
		await panelManager.togglePanel("mobile-toc-panel");
	};

	const setPanelVisibility = async (show: boolean): Promise<void> => {
		await panelManager.togglePanel("mobile-toc-panel", show);
	};

	const isGroupExpanded = (id: string): boolean =>
		manualExpandedGroups.includes(id) ||
		(autoExpandedGroupId === id && !manualCollapsedGroups.includes(id));

	const toggleGroup = (id: string) => {
		if (isGroupExpanded(id)) {
			manualExpandedGroups = manualExpandedGroups.filter((groupId) => groupId !== id);
			if (!manualCollapsedGroups.includes(id)) {
				manualCollapsedGroups = [...manualCollapsedGroups, id];
			}
			return;
		}

		manualCollapsedGroups = manualCollapsedGroups.filter((groupId) => groupId !== id);
		if (!manualExpandedGroups.includes(id)) {
			manualExpandedGroups = [...manualExpandedGroups, id];
		}
	};

	const ensureActiveGroupExpanded = (id: string) => {
		const parentId = findTOCGroupParentId(tocGroups, id);
		if (!parentId) {
			autoExpandedGroupId = "";
			return;
		}

		const group = tocGroups.find((item) => item.parent.id === parentId);
		if (!group || group.children.length === 0) {
			autoExpandedGroupId = "";
			return;
		}

		autoExpandedGroupId = parentId;
	};

	const isGroupActive = (group: TOCGroup): boolean =>
		group.parent.id === activeId ||
		group.children.some((child) => child.id === activeId);

	const scrollToHeading = (id: string) => {
		setPanelVisibility(false);
		scrollToHeadingUtil(id);
	};

	const navigateToPost = (url: string) => {
		setPanelVisibility(false);
		navigateToPage(url);
	};

	const syncCurrentHeading = () => {
		const headings = document.querySelectorAll("h1, h2, h3, h4, h5, h6");
		const scrollTop = window.scrollY;
		const offset = 100;

		let currentActiveId = "";
		headings.forEach((heading) => {
			if (heading.id) {
				const elementTop = (heading as HTMLElement).offsetTop - offset;
				if (scrollTop >= elementTop) {
					currentActiveId = heading.id;
				}
			}
		});

		activeId = currentActiveId;
		if (currentActiveId) {
			ensureActiveGroupExpanded(currentActiveId);
		} else {
			autoExpandedGroupId = "";
		}
	};

	const setupIntersectionObserver = () => {
		const headings = document.querySelectorAll("h1, h2, h3, h4, h5, h6");

		if (observer) {
			observer.disconnect();
		}

		observer = new IntersectionObserver(
			(entries) => {
				entries.forEach((entry) => {
					if (entry.isIntersecting) {
						activeId = entry.target.id;
						ensureActiveGroupExpanded(entry.target.id);
					}
				});
			},
			{
				rootMargin: "-80px 0px -80% 0px",
				threshold: 0,
			},
		);

		headings.forEach((heading) => {
			if (heading.id) {
				observer?.observe(heading);
			}
		});
	};

	const setupNavigationListeners = () => {
		if (typeof window === "undefined" || swupListenersRegistered) {
			return;
		}

		window.addEventListener("popstate", () => {
			setTimeout(init, 200);
		});
		swupListenersRegistered = true;
	};

	const init = () => {
						isHomePage = checkIsHomePage();
		setupNavigationListeners();

		if (isHomePage) {
			tocItems = [];
			tocGroups = [];
			manualExpandedGroups = [];
			manualCollapsedGroups = [];
			autoExpandedGroupId = "";
			postItems = generatePostItems();
			return;
		}

		const config = getTOCConfig();
		tocItems = generateTOCItems(config);
		tocGroups = groupTOCItems(tocItems);
		manualExpandedGroups = [];
		manualCollapsedGroups = [];
		autoExpandedGroupId = "";
		postItems = [];
		setupIntersectionObserver();
		syncCurrentHeading();
	};

	onMount(() => {
		setTimeout(init, 100);
		window.addEventListener("scroll", syncCurrentHeading, { passive: true });

		return () => {
			observer?.disconnect();
			window.removeEventListener("scroll", syncCurrentHeading);

			const w = window as unknown as {
				swup?: { hooks: { on: (event: string, cb: () => void) => void; off: (event: string) => void } };
			};
			if (w.swup) {
				w.swup.hooks.off("page:view");
			}

			swupListenersRegistered = false;
		};
	});

	if (typeof window !== "undefined") {
		(window as unknown as { mobileTOCInit?: () => void }).mobileTOCInit = init;
	}

	const getItemPadding = (depth: number, isActive: boolean): string =>
		`${Math.max(12, 12 + depth * 16 - (isActive ? 3 : 0))}px`;
</script>

<button
	onclick={togglePanel}
	aria-label="Table of Contents"
	id="mobile-toc-switch"
	class="btn-plain scale-animation rounded-lg h-11 w-11 active:scale-90 lg:!hidden theme-switch-btn"
>
	<Icon icon="material-symbols:format-list-bulleted" class="text-[1.25rem]" />
</button>

<div
	id="mobile-toc-panel"
	class="float-panel float-panel-closed mobile-toc-panel absolute md:w-[20rem] w-[calc(100vw-2rem)] top-20 left-4 md:left-[unset] right-4 shadow-2xl rounded-2xl p-4"
>
	<div class="flex items-center justify-between mb-4">
		<h3 class="text-lg font-bold text-[var(--primary)]">
			{isHomePage ? i18n(I18nKey.postList) : i18n(I18nKey.tableOfContents)}
		</h3>
		<button
			onclick={togglePanel}
			aria-label="Close TOC"
			class="btn-plain rounded-lg h-8 w-8 active:scale-90 theme-switch-btn"
		>
			<Icon icon="material-symbols:close" class="text-[1rem]" />
		</button>
	</div>

	{#if isHomePage}
		{#if postItems.length === 0}
			<div class="text-center py-8 text-black/50 dark:text-white/50">
				<Icon icon="material-symbols:article-outline" class="text-2xl mb-2" />
				<p>暂无文章</p>
			</div>
		{:else}
			<div class="post-content">
				{#each postItems as post}
					<button onclick={() => navigateToPost(post.url)} class="post-item">
						<div class="post-title">
							{#if post.pinned}
								<Icon icon="mdi:pin" class="pinned-icon" />
							{/if}
							{post.title}
						</div>
						{#if post.category}
							<div class="post-category">{post.category}</div>
						{/if}
					</button>
				{/each}
			</div>
		{/if}
	{:else}
		{#if tocGroups.length === 0}
			<div class="text-center py-8 text-black/50 dark:text-white/50">
				<p>{i18n(I18nKey.tocEmpty)}</p>
			</div>
		{:else}
			<div class="toc-content">
				{#each tocGroups as group}
					<div class="toc-group" class:active-branch={isGroupActive(group)}>
						<div class="toc-group-header">
								<button
									onclick={() => scrollToHeading(group.parent.id)}
								class="toc-item toc-parent"
								class:active={activeId === group.parent.id}
								style="padding-left: {getItemPadding(0, activeId === group.parent.id)}"
							>
								<span class="badge">{group.parent.badge}</span>
								<span class="toc-text">{group.parent.text}</span>
							</button>
							{#if group.children.length > 0}
									<button
										type="button"
										class="toc-toggle"
										class:expanded={isGroupExpanded(group.parent.id)}
										aria-label={isGroupExpanded(group.parent.id) ? "收起子目录" : "展开子目录"}
										aria-expanded={isGroupExpanded(group.parent.id)}
										onclick={(event) => {
											event.stopPropagation();
											toggleGroup(group.parent.id);
										}}
									>
									<Icon icon="material-symbols:keyboard-arrow-down-rounded" class="text-[1rem]" />
								</button>
							{/if}
						</div>

						{#if group.children.length > 0 && isGroupExpanded(group.parent.id)}
							<div class="toc-children">
								{#each group.children as item}
										<button
											onclick={() => scrollToHeading(item.id)}
										class="toc-item toc-child depth-{item.depth}"
										class:active={activeId === item.id}
										style="padding-left: {getItemPadding(item.depth, activeId === item.id)}"
									>
										{#if item.depth === 1}
											<span class="dot-square"></span>
										{:else}
											<span class="dot-small"></span>
										{/if}
										<span class="toc-text">{item.text}</span>
									</button>
								{/each}
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	{/if}
</div>

<style>
	.mobile-toc-panel {
		max-height: calc(100vh - 120px);
		overflow-y: auto;
		background: var(--card-bg);
		border: 1px solid var(--line-color);
		backdrop-filter: blur(10px);
	}

	:global(.theme-switch-btn)::before {
		transition: transform 75ms ease-out, background-color 0ms !important;
	}

	.toc-content,
	.post-content {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.post-content {
		gap: 4px;
	}

	.toc-group {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 6px;
		border-radius: 16px;
		border: 1px solid transparent;
		background: linear-gradient(180deg, rgba(255, 255, 255, 0.03), transparent);
	}

	.toc-group.active-branch {
		border-color: color-mix(in srgb, var(--primary) 12%, transparent);
		background:
			linear-gradient(180deg, color-mix(in srgb, var(--primary) 8%, transparent), transparent),
			linear-gradient(180deg, rgba(255, 255, 255, 0.03), transparent);
	}

	.toc-group-header {
		display: flex;
		align-items: stretch;
		gap: 8px;
	}

	.toc-children {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding-left: 10px;
		border-left: 1px solid color-mix(in srgb, var(--primary) 14%, transparent);
		margin-left: 12px;
	}

	.toc-item {
		display: flex;
		align-items: center;
		width: 100%;
		text-align: left;
		padding: 10px 12px;
		border-radius: 14px;
		transition:
			background-color 0.2s ease,
			border-color 0.2s ease,
			color 0.2s ease,
			transform 0.2s ease;
		border: 1px solid transparent;
		background: transparent;
		cursor: pointer;
		color: rgba(0, 0, 0, 0.75);
		font-size: 0.9rem;
		line-height: 1.4;
	}

	:global(.dark) .toc-item {
		color: rgba(255, 255, 255, 0.75);
	}

	.toc-item:hover {
		background: color-mix(in srgb, var(--primary) 8%, transparent);
		border-color: color-mix(in srgb, var(--primary) 10%, transparent);
		color: var(--primary);
	}

	.toc-item.active {
		background:
			linear-gradient(180deg, color-mix(in srgb, var(--primary) 11%, transparent), color-mix(in srgb, var(--primary) 7%, transparent));
		border-color: color-mix(in srgb, var(--primary) 16%, transparent);
		color: var(--primary);
		font-weight: 600;
	}

	.toc-parent {
		font-weight: 600;
		font-size: 1rem;
		gap: 8px;
	}

	.toc-child {
		gap: 6px;
	}

	.toc-child.depth-1 {
		font-size: 0.9rem;
	}

	.toc-child.depth-2,
	.toc-child.depth-3 {
		font-size: 0.84rem;
	}

	.toc-child.depth-4,
	.toc-child.depth-5 {
		font-size: 0.8rem;
		color: rgba(0, 0, 0, 0.55);
	}

	:global(.dark) .toc-child.depth-4,
	:global(.dark) .toc-child.depth-5 {
		color: rgba(255, 255, 255, 0.55);
	}

	.toc-toggle {
		width: 1.55rem;
		height: 1.55rem;
		flex-shrink: 0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border: 1px solid color-mix(in srgb, var(--primary) 10%, transparent);
		border-radius: 999px;
		background: color-mix(in srgb, var(--primary) 8%, transparent);
		color: color-mix(in srgb, var(--primary) 86%, white 14%);
		transition: transform 0.2s ease, border-color 0.2s ease, background-color 0.2s ease;
	}

	.toc-toggle:hover {
		background: color-mix(in srgb, var(--primary) 14%, transparent);
		border-color: color-mix(in srgb, var(--primary) 18%, transparent);
	}

	.toc-toggle.expanded {
		transform: rotate(180deg);
	}

	.active-branch .toc-toggle {
		border-color: color-mix(in srgb, var(--primary) 18%, transparent);
		background: color-mix(in srgb, var(--primary) 12%, transparent);
	}

	.badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 20px;
		height: 20px;
		padding: 0 4px;
		border-radius: 6px;
		background: var(--toc-badge-bg);
		color: var(--btn-content);
		font-size: 0.8rem;
		font-weight: 600;
		flex-shrink: 0;
		line-height: 1;
	}

	.dot-square {
		display: inline-block;
		width: 8px;
		height: 8px;
		border-radius: 2px;
		background: var(--toc-badge-bg);
		flex-shrink: 0;
	}

	.dot-small {
		display: inline-block;
		width: 6px;
		height: 6px;
		border-radius: 2px;
		background: rgba(0, 0, 0, 0.05);
		flex-shrink: 0;
	}

	:global(.dark) .dot-small {
		background: rgba(255, 255, 255, 0.1);
	}

	.toc-text {
		display: block;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		flex: 1;
	}

	.post-item {
		display: block;
		width: 100%;
		text-align: left;
		padding: 12px;
		border-radius: 8px;
		transition: all 0.2s ease;
		border: 1px solid var(--line-color);
		background: transparent;
		cursor: pointer;
	}

	.post-item:hover {
		background: var(--btn-plain-bg-hover);
		border-color: var(--primary);
		transform: translateY(-1px);
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
	}

	.post-title {
		font-size: 0.9rem;
		font-weight: 600;
		color: rgba(0, 0, 0, 0.75);
		margin-bottom: 4px;
		line-height: 1.4;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	:global(.dark) .post-title {
		color: rgba(255, 255, 255, 0.75);
	}

	.post-category {
		font-size: 0.75rem;
		color: rgba(0, 0, 0, 0.5);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	:global(.dark) .post-category {
		color: rgba(255, 255, 255, 0.5);
	}

	:global(.pinned-icon) {
		display: inline;
		color: var(--primary);
		font-size: 1.25rem;
		margin-right: 0.5rem;
		transform: translateY(-0.125rem);
		vertical-align: middle;
	}

	.post-item:hover .post-title {
		color: var(--primary);
	}

	.post-item:hover .post-category {
		color: rgba(0, 0, 0, 0.75);
	}

	:global(.dark) .post-item:hover .post-category {
		color: rgba(255, 255, 255, 0.75);
	}

	.mobile-toc-panel::-webkit-scrollbar {
		width: 4px;
	}

	.mobile-toc-panel::-webkit-scrollbar-track {
		background: transparent;
	}

	.mobile-toc-panel::-webkit-scrollbar-thumb {
		background: var(--line-color);
		border-radius: 2px;
	}

	.mobile-toc-panel::-webkit-scrollbar-thumb:hover {
		background: var(--text-color-25);
	}
</style>

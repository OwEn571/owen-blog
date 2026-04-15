import { render } from "astro:content";

import { getSortedPosts } from "@/utils/content-utils";
import { getPostUrl } from "@/utils/url-utils";

type SearchItemKind = "page" | "section";
type RenderedHeading = {
	depth: number;
	slug: string;
	text: string;
};

type SearchSectionDraft = {
	depth: number;
	title: string;
	content: string;
};

export type SearchIndexItem = {
	id: string;
	kind: SearchItemKind;
	url: string;
	pageUrl: string;
	pageTitle: string;
	title: string;
	sectionTitle?: string;
	parentTitle?: string;
	breadcrumb?: string;
	description: string;
	category: string;
	tags: string[];
	searchText: string;
	excerptSource: string;
};

export type SearchResultItem = {
	url: string;
	pageUrl: string;
	pageTitle: string;
	title: string;
	sectionTitle?: string;
	parentTitle?: string;
	breadcrumb?: string;
	excerpt: string;
	kind: SearchItemKind;
	category: string;
	tags: string[];
};

let cachedSearchIndexPromise: Promise<SearchIndexItem[]> | null = null;

export function normalizeText(value: string) {
	return String(value || "")
		.replace(/\r\n/g, "\n")
		.replace(/\u00a0/g, " ")
		.replace(/[ \t]+\n/g, "\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

export function stripMarkdown(source: string) {
	return normalizeText(
		String(source || "")
			.replace(/```([\s\S]*?)```/g, "\n$1\n")
			.replace(/~~~([\s\S]*?)~~~/g, "\n$1\n")
			.replace(/`([^`]+)`/g, "$1")
			.replace(/!\[[^\]]*]\(([^)]+)\)/g, "$1")
			.replace(/\[([^\]]+)]\(([^)]+)\)/g, "$1")
			.replace(/^#{1,6}\s+/gm, "")
			.replace(/^>\s?/gm, "")
			.replace(/^[-*+]\s+/gm, "")
			.replace(/^\d+\.\s+/gm, "")
			.replace(/<[^>]+>/g, " ")
			.replace(/[*_~]/g, ""),
	);
}

export function tokenizeQuery(query: string) {
	const normalized = normalizeText(query).toLowerCase();
	if (!normalized) {
		return [];
	}

	const groups = normalized.match(/[\p{Script=Han}]+|[\p{L}\p{N}_-]{2,}/gu) || [];
	const tokens = new Set<string>();

	for (const group of groups) {
		tokens.add(group);
		if (/[\p{Script=Han}]/u.test(group) && group.length <= 6) {
			for (const char of Array.from(group)) {
				tokens.add(char);
			}
		}
	}

	return Array.from(tokens);
}

export function buildExcerpt(
	text: string,
	query: string,
	tokens: string[],
	maxLength = 220,
) {
	const normalized = normalizeText(text);
	if (!normalized) {
		return "";
	}

	const candidates = [normalizeText(query), ...tokens].filter(Boolean);
	let hitIndex = -1;
	let hitLength = 0;
	const lower = normalized.toLowerCase();

	for (const candidate of candidates) {
		const currentIndex = lower.indexOf(candidate.toLowerCase());
		if (currentIndex !== -1) {
			hitIndex = currentIndex;
			hitLength = candidate.length;
			break;
		}
	}

	if (hitIndex === -1) {
		return normalized.slice(0, maxLength);
	}

	const start = Math.max(
		0,
		hitIndex - Math.floor((maxLength - hitLength) / 2),
	);
	const end = Math.min(normalized.length, start + maxLength);
	const snippet = normalized.slice(start, end);

	return `${start > 0 ? "…" : ""}${snippet}${
		end < normalized.length ? "…" : ""
	}`;
}

export function scoreText(
	text: string,
	query: string,
	tokens: string[],
	weight: number,
) {
	const haystack = String(text || "").toLowerCase();
	if (!haystack) {
		return 0;
	}

	let score = 0;
	const fullQuery = normalizeText(query).toLowerCase();
	if (fullQuery && haystack.includes(fullQuery)) {
		score += weight * 6;
	}

	for (const token of tokens) {
		if (haystack.includes(token)) {
			score += weight;
		}
	}

	return score;
}

export function getParentTitle(postId: string, category?: string | null) {
	if (category && category.trim()) {
		return category.trim();
	}

	const segments = postId.split("/");
	return segments.length > 1
		? segments[segments.length - 2].replace(/[-_]/g, " ")
		: "";
}

function sanitizeHeadingTitle(value: string) {
	return normalizeText(
		stripMarkdown(String(value || "")).replace(/\s*#+\s*$/g, ""),
	);
}

function fallbackSlugify(value: string) {
	const normalized = normalizeText(value)
		.toLowerCase()
		.replace(/[^\p{L}\p{N}\s-]/gu, "")
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
	return normalized || "section";
}

function createUniqueSlug(baseSlug: string, usedSlugs: Map<string, number>) {
	const nextCount = (usedSlugs.get(baseSlug) || 0) + 1;
	usedSlugs.set(baseSlug, nextCount);
	return nextCount === 1 ? baseSlug : `${baseSlug}-${nextCount}`;
}

function extractSectionDrafts(markdown: string): SearchSectionDraft[] {
	const drafts: SearchSectionDraft[] = [];
	const lines = String(markdown || "").replace(/\r\n/g, "\n").split("\n");
	let current:
		| {
				depth: number;
				title: string;
				lines: string[];
		  }
		| null = null;
	let activeFenceMarker = "";

	const flushCurrent = () => {
		if (!current) {
			return;
		}

		drafts.push({
			depth: current.depth,
			title: current.title,
			content: normalizeText(current.lines.join("\n")),
		});
		current = null;
	};

	for (const line of lines) {
		const fenceMatch = line.match(/^\s*(```+|~~~+)/);
		if (fenceMatch) {
			const marker = fenceMatch[1].charAt(0);
			if (!activeFenceMarker) {
				activeFenceMarker = marker;
			} else if (activeFenceMarker === marker) {
				activeFenceMarker = "";
			}

			if (current) {
				current.lines.push(line);
			}
			continue;
		}

		if (!activeFenceMarker) {
			const headingMatch = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
			if (headingMatch) {
				flushCurrent();
				current = {
					depth: headingMatch[1].length,
					title: sanitizeHeadingTitle(headingMatch[2]),
					lines: [],
				};
				continue;
			}
		}

		if (current) {
			current.lines.push(line);
		}
	}

	flushCurrent();
	return drafts.filter((draft) => draft.title);
}

function consumeHeadingMeta(
	renderedHeadings: RenderedHeading[],
	draft: SearchSectionDraft,
	cursor: { index: number },
) {
	const normalizedDraftTitle = sanitizeHeadingTitle(draft.title).toLowerCase();

	for (let offset = 0; offset < 4; offset += 1) {
		const candidate = renderedHeadings[cursor.index + offset];
		if (!candidate) {
			break;
		}
		if (sanitizeHeadingTitle(candidate.text).toLowerCase() === normalizedDraftTitle) {
			cursor.index += offset + 1;
			return candidate;
		}
	}

	const fallbackCandidate = renderedHeadings[cursor.index];
	if (fallbackCandidate) {
		cursor.index += 1;
		return fallbackCandidate;
	}

	return null;
}

async function buildPostSearchIndex(post: Awaited<ReturnType<typeof getSortedPosts>>[number]) {
	const pageUrl = getPostUrl(post);
	const description = normalizeText(post.data.description || "");
	const category = normalizeText(post.data.category || "");
	const tags = (post.data.tags || [])
		.map((tag) => normalizeText(String(tag)))
		.filter(Boolean);
	const parentTitle = getParentTitle(post.id, post.data.category);
	const bodyText = stripMarkdown(String(post.body || ""));
	const pageTitle = normalizeText(post.data.title || "");
	const excerptSource = description || bodyText || pageTitle;
	const pageEntry: SearchIndexItem = {
		id: post.id,
		kind: "page",
		url: pageUrl,
		pageUrl,
		pageTitle,
		title: pageTitle,
		parentTitle,
		description,
		category,
		tags,
		searchText: normalizeText(
			[pageTitle, description, category, ...tags, bodyText]
				.filter(Boolean)
				.join("\n\n"),
		),
		excerptSource,
	};

	const { headings } = await render(post);
	const renderedHeadings = (headings || []) as RenderedHeading[];
	const drafts = extractSectionDrafts(String(post.body || ""));
	const headingCursor = { index: 0 };
	const slugCounts = new Map<string, number>();
	const breadcrumbStack: { depth: number; text: string }[] = [];
	const sectionEntries: SearchIndexItem[] = [];

	for (const draft of drafts) {
		const headingMeta = consumeHeadingMeta(renderedHeadings, draft, headingCursor);
		const depth = headingMeta?.depth ?? draft.depth;
		const title = sanitizeHeadingTitle(headingMeta?.text || draft.title);
		if (!title) {
			continue;
		}

		const slug =
			headingMeta?.slug ||
			createUniqueSlug(fallbackSlugify(title), slugCounts);

		while (
			breadcrumbStack.length &&
			breadcrumbStack[breadcrumbStack.length - 1].depth >= depth
		) {
			breadcrumbStack.pop();
		}
		breadcrumbStack.push({ depth, text: title });

		const isDuplicatePageHeading =
			depth === 1 && title.toLowerCase() === pageTitle.toLowerCase();
		if (isDuplicatePageHeading || depth > 4) {
			continue;
		}

		const breadcrumb = breadcrumbStack.map((item) => item.text).join(" / ");
		const sectionText = stripMarkdown(draft.content);
		const sectionSearchText = normalizeText(
			[
				pageTitle,
				title,
				breadcrumb,
				description,
				category,
				...tags,
				sectionText,
			]
				.filter(Boolean)
				.join("\n\n"),
		);

		sectionEntries.push({
			id: `${post.id}#${slug}`,
			kind: "section",
			url: `${pageUrl}#${slug}`,
			pageUrl,
			pageTitle,
			title,
			sectionTitle: title,
			parentTitle,
			breadcrumb,
			description,
			category,
			tags,
			searchText: sectionSearchText,
			excerptSource: sectionText || description || title,
		});
	}

	return [pageEntry, ...sectionEntries];
}

async function buildSearchIndexItems() {
	const posts = await getSortedPosts();
	const allItems = await Promise.all(posts.map((post) => buildPostSearchIndex(post)));
	return allItems.flat();
}

export async function getSearchIndexItems(): Promise<SearchIndexItem[]> {
	if (!cachedSearchIndexPromise) {
		cachedSearchIndexPromise = buildSearchIndexItems();
	}
	return cachedSearchIndexPromise;
}

export function searchIndexItems(
	items: SearchIndexItem[],
	query: string,
	limit = 10,
): SearchResultItem[] {
	const normalizedQuery = String(query || "").trim().slice(0, 120);
	if (!normalizedQuery) {
		return [];
	}

	const tokens = tokenizeQuery(normalizedQuery);
	const rankedEntries = items
		.map((item) => {
			const score =
				scoreText(item.pageTitle, normalizedQuery, tokens, item.kind === "page" ? 26 : 16) +
				scoreText(item.title, normalizedQuery, tokens, item.kind === "section" ? 22 : 28) +
				scoreText(item.breadcrumb || "", normalizedQuery, tokens, 10) +
				scoreText(item.description, normalizedQuery, tokens, 8) +
				scoreText(item.category, normalizedQuery, tokens, 8) +
				scoreText(item.tags.join(" "), normalizedQuery, tokens, 7) +
				scoreText(item.searchText, normalizedQuery, tokens, item.kind === "section" ? 4 : 3) +
				(item.kind === "section" ? 2 : 0);

			return {
				score,
				item,
			};
		})
		.filter((entry) => entry.score > 0)
		.sort((left, right) => right.score - left.score);

	const perPageCounts = new Map<string, number>();
	const seenUrls = new Set<string>();
	const results: SearchResultItem[] = [];

	for (const entry of rankedEntries) {
		const { item } = entry;
		if (seenUrls.has(item.url)) {
			continue;
		}

		const currentPageCount = perPageCounts.get(item.pageUrl) || 0;
		if (currentPageCount >= 2) {
			continue;
		}

		results.push({
			url: item.url,
			pageUrl: item.pageUrl,
			pageTitle: item.pageTitle,
			title: item.title,
			sectionTitle: item.sectionTitle,
			parentTitle: item.parentTitle,
			breadcrumb: item.breadcrumb,
			excerpt: buildExcerpt(
				item.excerptSource || item.searchText,
				normalizedQuery,
				tokens,
			),
			kind: item.kind,
			category: item.category,
			tags: item.tags,
		});

		seenUrls.add(item.url);
		perPageCounts.set(item.pageUrl, currentPageCount + 1);

		if (results.length >= limit) {
			break;
		}
	}

	return results;
}

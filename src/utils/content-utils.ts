import I18nKey from "@i18n/i18nKey";
import { i18n } from "@i18n/translation";
import { initPostIdMap } from "@utils/permalink-utils";
import { getCategoryUrl, getPostUrl } from "@utils/url-utils";
import { type CollectionEntry, getCollection } from "astro:content";

type PostLike = {
	id: string;
	data?: {
		published?: Date;
	};
};

// // Retrieve posts and sort them by publication date
async function getRawSortedPosts() {
	const allBlogPosts = await getCollection("posts", ({ data }) => {
		return data.draft !== true;
	});

	const sorted = allBlogPosts.sort((a, b) => {
		// 首先按置顶状态排序，置顶文章在前
		if (a.data.pinned && !b.data.pinned) {return -1;}
		if (!a.data.pinned && b.data.pinned) {return 1;}

		// 如果置顶状态相同，优先按 Priority 排序（数值越小越靠前）
		if (a.data.pinned && b.data.pinned) {
			const priorityA = a.data.priority;
			const priorityB = b.data.priority;
			if (priorityA !== undefined && priorityB !== undefined) {
				if (priorityA !== priorityB) {return priorityA - priorityB;}
			} else if (priorityA !== undefined) {
				return -1;
			} else if (priorityB !== undefined) {
				return 1;
			}
		}

		// 否则按发布日期排序
		const dateA = new Date(a.data.published);
		const dateB = new Date(b.data.published);
		return dateA > dateB ? -1 : 1;
	});
	return sorted;
}

export function getSeriesKey(postId: string) {
	const parts = postId.split("/");
	if (parts.length <= 1) {return "";}
	return parts.slice(0, -1).join("/");
}

function getSeriesSlug(postId: string) {
	return postId.split("/").pop() || postId;
}

function getSeriesOrderValue(postId: string) {
	const slug = getSeriesSlug(postId);
	const match = slug.match(/^(\d+)(?=[-_]|$)/);
	return match ? Number.parseInt(match[1], 10) : Number.POSITIVE_INFINITY;
}

export function comparePostsBySeriesOrder<T extends PostLike>(left: T, right: T) {
	const leftOrder = getSeriesOrderValue(left.id);
	const rightOrder = getSeriesOrderValue(right.id);

	if (leftOrder !== rightOrder) {
		return leftOrder - rightOrder;
	}

	const leftPublished = left.data?.published?.getTime();
	const rightPublished = right.data?.published?.getTime();
	if (
		typeof leftPublished === "number" &&
		typeof rightPublished === "number" &&
		leftPublished !== rightPublished
	) {
		return leftPublished - rightPublished;
	}

	return getSeriesSlug(left.id).localeCompare(getSeriesSlug(right.id), "zh-CN", {
		numeric: true,
		sensitivity: "base",
	});
}

export function sortPostsBySeriesOrder<T extends PostLike>(posts: T[]) {
	return [...posts].sort(comparePostsBySeriesOrder);
}

export async function getSortedPosts() {
	const sorted = await getRawSortedPosts();

	for (let i = 1; i < sorted.length; i++) {
		sorted[i].data.nextSlug = sorted[i - 1].id;
		sorted[i].data.nextTitle = sorted[i - 1].data.title;
	}
	for (let i = 0; i < sorted.length - 1; i++) {
		sorted[i].data.prevSlug = sorted[i + 1].id;
		sorted[i].data.prevTitle = sorted[i + 1].data.title;
	}

	const seriesGroups = new Map<string, typeof sorted>();
	for (const post of sorted) {
		const seriesKey = getSeriesKey(post.id);
		if (!seriesKey) {continue;}
		const group = seriesGroups.get(seriesKey) || [];
		group.push(post);
		seriesGroups.set(seriesKey, group);
	}

	for (const group of seriesGroups.values()) {
		if (group.length <= 1) {continue;}
		group.sort(comparePostsBySeriesOrder);

		for (let i = 0; i < group.length; i++) {
			const current = group[i];
			const previousInSeries = group[i - 1];
			const nextInSeries = group[i + 1];

			current.data.nextSlug = previousInSeries?.id || "";
			current.data.nextTitle = previousInSeries?.data.title || "";
			current.data.prevSlug = nextInSeries?.id || "";
			current.data.prevTitle = nextInSeries?.data.title || "";
		}
	}

	return sorted;
}
export interface PostForList {
	id: string;
	data: CollectionEntry<"posts">["data"];
	url?: string; // 预计算的文章 URL
}
export async function getSortedPostsList(): Promise<PostForList[]> {
	const sortedFullPosts = await getRawSortedPosts();

	// 初始化文章 ID 映射（用于 permalink 功能）
	initPostIdMap(sortedFullPosts);

	// delete post.body，并预计算 URL
	const sortedPostsList = sortedFullPosts.map((post) => ({
		id: post.id,
		data: post.data,
		url: getPostUrl(post),
	}));

	return sortedPostsList;
}
export interface Tag {
	name: string;
	count: number;
}

export async function getTagList(): Promise<Tag[]> {
	const allBlogPosts = await getCollection<"posts">("posts", ({ data }) => {
		return data.draft !== true;
	});

	const countMap: Record<string, number> = {};
	allBlogPosts.forEach((post: { data: { tags: string[] } }) => {
		post.data.tags.forEach((tag: string) => {
			if (!countMap[tag]) {countMap[tag] = 0;}
			countMap[tag]++;
		});
	});

	// sort tags
	const keys: string[] = Object.keys(countMap).sort((a, b) => {
		return a.toLowerCase().localeCompare(b.toLowerCase());
	});

	return keys.map((key) => ({ name: key, count: countMap[key] }));
}

export interface Category {
	name: string;
	count: number;
	url: string;
}

export async function getCategoryList(): Promise<Category[]> {
	const allBlogPosts = await getCollection<"posts">("posts", ({ data }) => {
		return data.draft !== true;
	});
	const count: Record<string, number> = {};
	allBlogPosts.forEach((post: { data: { category: string | null } }) => {
		if (!post.data.category) {
			const ucKey = i18n(I18nKey.uncategorized);
			count[ucKey] = count[ucKey] ? count[ucKey] + 1 : 1;
			return;
		}

		const categoryName =
			typeof post.data.category === "string"
				? post.data.category.trim()
				: String(post.data.category).trim();

		count[categoryName] = count[categoryName] ? count[categoryName] + 1 : 1;
	});

	const lst = Object.keys(count).sort((a, b) => {
		return a.toLowerCase().localeCompare(b.toLowerCase());
	});

	const ret: Category[] = [];
	for (const c of lst) {
		ret.push({
			name: c,
			count: count[c],
			url: getCategoryUrl(c),
		});
	}
	return ret;
}

import type { APIRoute } from "astro";

import { getSortedPosts } from "@/utils/content-utils";
import { getPostUrl } from "@/utils/url-utils";

type SearchItem = {
	url: string;
	title: string;
	parentTitle?: string;
	excerpt: string;
};

function normalizeText(value: string) {
	return value
		.replace(/\r\n/g, "\n")
		.replace(/\u00a0/g, " ")
		.replace(/[ \t]+\n/g, "\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

function stripMarkdown(source: string) {
	return normalizeText(
		source
			.replace(/```([\s\S]*?)```/g, "\n$1\n")
			.replace(/`([^`]+)`/g, "$1")
			.replace(/!\[[^\]]*]\(([^)]+)\)/g, "$1")
			.replace(/\[([^\]]+)]\(([^)]+)\)/g, "$1")
			.replace(/^#{1,6}\s+/gm, "")
			.replace(/^>\s?/gm, "")
			.replace(/^[-*+]\s+/gm, "")
			.replace(/^\d+\.\s+/gm, "")
			.replace(/[*_~]/g, ""),
	);
}

function tokenizeQuery(query: string) {
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

function buildExcerpt(text: string, query: string, tokens: string[], maxLength = 220) {
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

	const start = Math.max(0, hitIndex - Math.floor((maxLength - hitLength) / 2));
	const end = Math.min(normalized.length, start + maxLength);
	const snippet = normalized.slice(start, end);

	return `${start > 0 ? "…" : ""}${snippet}${end < normalized.length ? "…" : ""}`;
}

function scoreText(text: string, query: string, tokens: string[], weight: number) {
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

function getParentTitle(postId: string, category?: string | null) {
	if (category && category.trim()) {
		return category.trim();
	}

	const segments = postId.split("/");
	return segments.length > 1
		? segments[segments.length - 2].replace(/[-_]/g, " ")
		: "";
}

export const GET: APIRoute = async ({ request }) => {
	const url = new URL(request.url);
	const query = String(url.searchParams.get("q") || "").trim().slice(0, 120);

	if (!query) {
		return new Response(JSON.stringify({ items: [] }), {
			headers: {
				"Content-Type": "application/json; charset=utf-8",
				"Cache-Control": "no-store",
			},
		});
	}

	const tokens = tokenizeQuery(query);
	const posts = await getSortedPosts();

	const items = posts
		.map((post) => {
			const searchText = normalizeText(
				[
					post.data.title,
					post.data.description || "",
					post.data.category || "",
					...(post.data.tags || []),
					stripMarkdown(String(post.body || "")),
				]
					.filter(Boolean)
					.join("\n\n"),
			);
			const score =
				scoreText(post.data.title, query, tokens, 18) +
				scoreText(post.data.description || "", query, tokens, 10) +
				scoreText(post.data.category || "", query, tokens, 8) +
				scoreText((post.data.tags || []).join(" "), query, tokens, 7) +
				scoreText(searchText, query, tokens, 3);

			return {
				score,
				item: {
					url: getPostUrl(post),
					title: post.data.title,
					parentTitle: getParentTitle(post.id, post.data.category),
					excerpt: buildExcerpt(searchText, query, tokens),
				} satisfies SearchItem,
			};
		})
		.filter((entry) => entry.score > 0)
		.sort((left, right) => right.score - left.score)
		.slice(0, 8)
		.map((entry) => entry.item);

	return new Response(JSON.stringify({ items }), {
		headers: {
			"Content-Type": "application/json; charset=utf-8",
			"Cache-Control": "no-store",
		},
	});
};

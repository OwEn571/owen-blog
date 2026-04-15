import type { APIRoute } from "astro";

import { getSearchIndexItems, searchIndexItems } from "@/utils/search-utils";

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

	const indexItems = await getSearchIndexItems();
	const items = searchIndexItems(indexItems, query);

	return new Response(JSON.stringify({ items }), {
		headers: {
			"Content-Type": "application/json; charset=utf-8",
			"Cache-Control": "no-store",
		},
	});
};

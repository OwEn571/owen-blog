import type { APIRoute } from "astro";

import { getAiosNewsroomSnapshot } from "../../../../server/aios-newsroom";

export const prerender = false;

export const GET: APIRoute = async () => {
	const snapshot = await getAiosNewsroomSnapshot();
	return new Response(JSON.stringify(snapshot), {
		status: snapshot.available ? 200 : 503,
		headers: {
			"Content-Type": "application/json; charset=utf-8",
			"Cache-Control": "no-store",
		},
	});
};


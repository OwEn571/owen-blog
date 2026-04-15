import type { APIRoute } from "astro";

import { injectAiosIframeTheme } from "../../../../server/aios-iframe-theme";
import { getAiosNewsroomDashboardHtml } from "../../../../server/aios-newsroom";

export const prerender = false;

export const GET: APIRoute = async () => {
	const dashboard = await getAiosNewsroomDashboardHtml();
	return new Response(
		dashboard.ok
			? injectAiosIframeTheme(dashboard.html, "dashboard")
			: `<main style="font-family:system-ui;padding:2rem;line-height:1.7"><h1>AIOS Dashboard Unavailable</h1><p>${dashboard.error || "AIOS dashboard HTML is unavailable."}</p></main>`,
		{
			status: dashboard.ok ? 200 : dashboard.status,
			headers: {
				"Content-Type": "text/html; charset=utf-8",
				"Cache-Control": "no-store",
			},
		},
	);
};

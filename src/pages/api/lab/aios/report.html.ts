import type { APIRoute } from "astro";

import { injectAiosIframeTheme } from "../../../../server/aios-iframe-theme";
import { getAiosNewsroomReportHtml } from "../../../../server/aios-newsroom";

export const prerender = false;

export const GET: APIRoute = async () => {
	const report = await getAiosNewsroomReportHtml();
	return new Response(
		report.ok
			? injectAiosIframeTheme(report.html, "report")
			: `<main style="font-family:system-ui;padding:2rem;line-height:1.7"><h1>AIOS Report Unavailable</h1><p>${report.error || "Latest report HTML is unavailable."}</p></main>`,
		{
			status: report.ok ? 200 : report.status,
			headers: {
				"Content-Type": "text/html; charset=utf-8",
				"Cache-Control": "no-store",
			},
		},
	);
};

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

type JsonValue =
	| string
	| number
	| boolean
	| null
	| JsonValue[]
	| { [key: string]: JsonValue };

type JsonObject = Record<string, JsonValue>;

const DEFAULT_AIOS_NEWSROOM_BASE_URL = "http://127.0.0.1:8010";
const DEFAULT_AIOS_PROJECT_ROOT = "/home/ubuntu/owen/AIOS-NP";
const DEFAULT_TIMEOUT_MS = 4500;
const DEFAULT_MCP_SERVER_URL = "http://127.0.0.1:8011/";

function trimTrailingSlash(value: string) {
	return value.replace(/\/+$/, "");
}

export function getAiosNewsroomBaseUrl() {
	return trimTrailingSlash(
		process.env.AIOS_NEWSROOM_BASE_URL || DEFAULT_AIOS_NEWSROOM_BASE_URL,
	);
}

function getAiosProjectRoot() {
	return process.env.AIOS_NEWSROOM_PROJECT_ROOT || DEFAULT_AIOS_PROJECT_ROOT;
}

function getAiosOutputDir() {
	return path.join(getAiosProjectRoot(), "output");
}

function getAiosEcosystemDir() {
	return path.join(getAiosProjectRoot(), "ecosystem");
}

function asJsonObject(value: unknown): JsonObject | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return null;
	}
	return value as JsonObject;
}

function asJsonObjectArray(value: unknown): JsonObject[] {
	if (!Array.isArray(value)) {
		return [];
	}
	return value.filter(
		(item): item is JsonObject =>
			Boolean(item) && typeof item === "object" && !Array.isArray(item),
	);
}

async function readOptionalText(filePath: string | null) {
	if (!filePath) {
		return null;
	}
	try {
		return await readFile(filePath, "utf-8");
	} catch {
		return null;
	}
}

async function readOptionalJson(filePath: string | null) {
	const text = await readOptionalText(filePath);
	if (!text) {
		return null;
	}
	try {
		return JSON.parse(text) as JsonObject | JsonObject[] | null;
	} catch {
		return null;
	}
}

async function findLatestOutputFile(extension: "html" | "json" | "txt") {
	try {
		const outputDir = getAiosOutputDir();
		const entries = await readdir(outputDir, { withFileTypes: true });
		const candidates = entries
			.filter(
				(entry) =>
					entry.isFile() &&
					entry.name.startsWith("新闻报_") &&
					entry.name.endsWith(`.${extension}`),
			)
			.map((entry) => entry.name)
			.sort((left, right) => right.localeCompare(left, "zh-CN"));
		return candidates[0] ? path.join(outputDir, candidates[0]) : null;
	} catch {
		return null;
	}
}

async function listLatestJsonFiles(directory: string, limit: number) {
	try {
		const entries = await readdir(directory, { withFileTypes: true });
		return entries
			.filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
			.map((entry) => entry.name)
			.sort((left, right) => right.localeCompare(left, "zh-CN"))
			.slice(0, limit)
			.map((name) => path.join(directory, name));
	} catch {
		return [];
	}
}

function defaultMcpMetadata() {
	return {
		local_url: process.env.AIOS_MCP_SERVER_URL || DEFAULT_MCP_SERVER_URL,
		public_url: process.env.AIOS_MCP_PUBLIC_URL || "",
		tool_names: ["get_today_news_brief", "get_today_news_payload"],
		resource_uris: [
			"news://latest/summary",
			"news://latest/report-json",
			"news://latest/report-html",
			"news://latest/report-text",
			"news://latest/snapshot",
		],
	};
}

function formatDisplayTime(value: unknown) {
	const text = String(value || "").trim();
	if (!text) {
		return "N/A";
	}
	return text
		.replace("T", " ")
		.replace(/\.\d+/, "")
		.replace(/\+08:00$/, " CST");
}

function escapeHtml(value: unknown) {
	return String(value || "")
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}

function buildLocalDashboardHtml(payload: {
	report: JsonObject | null;
	state: JsonObject | null;
	metrics: JsonObject | null;
	latestRun: JsonObject | null;
	runs: JsonObject[];
}) {
	const report = payload.report || {};
	const state = payload.state || {};
	const metrics = payload.metrics || {};
	const latestRun = payload.latestRun || {};
	const reportMetrics = asJsonObject(report.metrics) || {};
	const overview = asJsonObject(metrics.overview) || {};
	const recentRuns = payload.runs.slice(0, 6);

	const statCards = [
		{
			label: "最新日报时间",
			value:
				formatDisplayTime(report.generated_at) ||
				formatDisplayTime(latestRun.finished_at),
		},
		{
			label: "最新成稿数",
			value: String(reportMetrics.total_articles || overview.article_count || 0),
		},
		{
			label: "活跃栏目",
			value: String(reportMetrics.active_sections || overview.active_domains || 0),
		},
		{
			label: "运行状态",
			value: String(latestRun.status || (state.run as JsonObject | null)?.status || "unknown"),
		},
	];

	const stageItems = asJsonObjectArray((state.recent_events as JsonValue) || []).slice(-8);

	return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>AIOS News Ecosystem</title>
    <style>
      :root {
        color-scheme: light dark;
        --bg: #f5efe7;
        --panel: rgba(255, 252, 247, 0.92);
        --line: rgba(34, 37, 46, 0.12);
        --ink: #20232d;
        --muted: #6a6f7c;
        --accent: #1f6b70;
        --accent-soft: rgba(31, 107, 112, 0.12);
      }
      @media (prefers-color-scheme: dark) {
        :root {
          --bg: #0d1320;
          --panel: rgba(15, 23, 36, 0.9);
          --line: rgba(255, 255, 255, 0.1);
          --ink: #ecf3ff;
          --muted: rgba(219, 229, 244, 0.72);
          --accent: #79d0d5;
          --accent-soft: rgba(121, 208, 213, 0.12);
        }
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "SF Pro Display", "PingFang SC", "Microsoft YaHei", sans-serif;
        background:
          radial-gradient(circle at top right, rgba(31, 107, 112, 0.16), transparent 18rem),
          var(--bg);
        color: var(--ink);
      }
      main {
        width: min(1100px, calc(100vw - 2rem));
        margin: 0 auto;
        padding: 2rem 0 3rem;
      }
      .banner, .panel {
        border: 1px solid var(--line);
        background: var(--panel);
        border-radius: 1.25rem;
        box-shadow: 0 24px 72px rgba(15, 23, 42, 0.12);
      }
      .banner {
        padding: 1rem 1.1rem;
        margin-bottom: 1rem;
      }
      .eyebrow {
        margin: 0 0 0.3rem;
        font-size: 0.8rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--muted);
      }
      h1, h2, p { margin: 0; }
      h1 { font-size: clamp(2rem, 3.4vw, 3rem); }
      .subcopy {
        margin-top: 0.75rem;
        line-height: 1.7;
        color: var(--muted);
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 0.9rem;
        margin-top: 1rem;
      }
      .stat {
        padding: 1rem;
      }
      .stat-label {
        font-size: 0.82rem;
        color: var(--muted);
      }
      .stat-value {
        margin-top: 0.5rem;
        font-size: 1.3rem;
        font-weight: 700;
      }
      .section {
        margin-top: 1rem;
        padding: 1rem 1.1rem;
      }
      .section + .section {
        margin-top: 1rem;
      }
      .meta {
        display: flex;
        flex-wrap: wrap;
        gap: 0.6rem;
        margin-top: 0.9rem;
      }
      .meta span {
        display: inline-flex;
        align-items: center;
        padding: 0.45rem 0.78rem;
        border-radius: 999px;
        border: 1px solid var(--line);
        background: var(--accent-soft);
        color: var(--muted);
        font-size: 0.86rem;
      }
      ul {
        margin: 0.9rem 0 0;
        padding-left: 1.15rem;
        color: var(--muted);
        line-height: 1.7;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 0.9rem;
      }
      th, td {
        text-align: left;
        padding: 0.78rem 0.35rem;
        border-bottom: 1px solid var(--line);
        font-size: 0.92rem;
      }
      th { color: var(--muted); font-weight: 600; }
      @media (max-width: 900px) {
        .grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }
      @media (max-width: 600px) {
        main {
          width: min(100vw - 1rem, 100%);
          padding-top: 1rem;
        }
        .grid {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <section class="banner">
        <p class="eyebrow">AIOS / Local Fallback</p>
        <h1>AIOS News Ecosystem</h1>
        <p class="subcopy">AIOS 服务当前走的是本机缓存快照。这份系统面板来自最近一次成功产物和生态状态文件，所以展示页不会因为服务临时忙碌而空白。</p>
      </section>

      <section class="grid">
        ${statCards
					.map(
						(card) => `<article class="panel stat">
          <div class="stat-label">${escapeHtml(card.label)}</div>
          <div class="stat-value">${escapeHtml(card.value)}</div>
        </article>`,
					)
					.join("")}
      </section>

      <section class="panel section">
        <p class="eyebrow">Report</p>
        <h2>${escapeHtml(String(report.report_title || "今日新闻现场"))}</h2>
        <p class="subcopy">${escapeHtml(String(report.overview || "当前显示的是 AIOS 本机保留的最近日报摘要。"))}</p>
        <div class="meta">
          <span>${escapeHtml(String(report.date_label || "日期未知"))}</span>
          <span>${escapeHtml(formatDisplayTime(report.generated_at))}</span>
          <span>${escapeHtml(String(reportMetrics.total_sources || 0))} 条参考信源</span>
        </div>
      </section>

      <section class="panel section">
        <p class="eyebrow">Workflow</p>
        <h2>最近运行状态</h2>
        <div class="meta">
          <span>Run ID: ${escapeHtml(String(latestRun.id || "N/A"))}</span>
          <span>Status: ${escapeHtml(String(latestRun.status || "unknown"))}</span>
          <span>Source: ${escapeHtml(String(latestRun.source || "unknown"))}</span>
          <span>Started: ${escapeHtml(formatDisplayTime(latestRun.started_at))}</span>
        </div>
        <ul>
          <li>阶段完成数：${escapeHtml(String((state.run as JsonObject | null)?.completed_stages || 0))}</li>
          <li>计划阶段：${escapeHtml(String(((state.run as JsonObject | null)?.planned_stages as JsonValue[] | undefined)?.length || 0))}</li>
          <li>最近基准：${escapeHtml(String((metrics.stage_benchmarks as JsonObject | null)?.slowest_stage || "N/A"))}</li>
        </ul>
      </section>

      <section class="panel section">
        <p class="eyebrow">Recent Runs</p>
        <h2>近期运行记录</h2>
        <table>
          <thead>
            <tr>
              <th>Run</th>
              <th>Status</th>
              <th>Source</th>
              <th>Started</th>
            </tr>
          </thead>
          <tbody>
            ${recentRuns
							.map(
								(run) => `<tr>
              <td>${escapeHtml(String(run.id || "N/A"))}</td>
              <td>${escapeHtml(String(run.status || "unknown"))}</td>
              <td>${escapeHtml(String(run.source || "unknown"))}</td>
              <td>${escapeHtml(formatDisplayTime(run.started_at || run.created_at))}</td>
            </tr>`,
							)
							.join("")}
          </tbody>
        </table>
      </section>

      <section class="panel section">
        <p class="eyebrow">Event Feed</p>
        <h2>最近阶段事件</h2>
        <ul>
          ${stageItems.length
						? stageItems
								.map((item) => {
									const event = String(item.event || "event");
									const stage = String(item.stage || item.phase || "");
									return `<li>${escapeHtml(event)} ${escapeHtml(stage)} ${escapeHtml(formatDisplayTime(item.timestamp))}</li>`;
								})
								.join("")
						: "<li>当前没有可展示的事件记录。</li>"}
        </ul>
      </section>
    </main>
  </body>
</html>`;
}

async function loadLocalAiosFallbackData() {
	const ecosystemDir = getAiosEcosystemDir();
	const [reportHtmlPath, reportJsonPath, latestRun, state, metrics, snapshot, runs, agents, agentRuns] =
		await Promise.all([
			findLatestOutputFile("html"),
			findLatestOutputFile("json"),
			readOptionalJson(path.join(ecosystemDir, "latest_run.json")),
			readOptionalJson(path.join(ecosystemDir, "states", "latest.json")),
			readOptionalJson(path.join(ecosystemDir, "metrics", "latest.json")),
			readOptionalJson(path.join(ecosystemDir, "snapshots", "latest.json")),
			listLatestJsonFiles(path.join(ecosystemDir, "runs"), 6),
			listLatestJsonFiles(path.join(ecosystemDir, "agents"), 10),
			listLatestJsonFiles(path.join(ecosystemDir, "agent_runs"), 6),
		]);

	const [reportHtml, reportJson, recentRuns, agentList, recentAgentRuns] =
		await Promise.all([
			readOptionalText(reportHtmlPath),
			readOptionalJson(reportJsonPath),
			Promise.all(runs.map((filePath) => readOptionalJson(filePath))),
			Promise.all(agents.map((filePath) => readOptionalJson(filePath))),
			Promise.all(agentRuns.map((filePath) => readOptionalJson(filePath))),
		]);

	const snapshotObject = asJsonObject(snapshot);
	const snapshotReport = asJsonObject(snapshotObject?.report);
	const reportDocument =
		asJsonObject(reportJson) || asJsonObject(snapshotReport?.document) || null;
	const fallbackAvailable = Boolean(
		reportHtml ||
		reportDocument ||
		asJsonObject(state) ||
		asJsonObject(metrics) ||
		snapshotObject,
	);

	return {
		available: fallbackAvailable,
		reportHtml,
		report: reportDocument,
		latestRun: asJsonObject(latestRun),
		state: asJsonObject(state),
		metrics: asJsonObject(metrics),
		snapshot: snapshotObject,
		runs: asJsonObjectArray(recentRuns),
		agents: asJsonObjectArray(agentList),
		agentRuns: asJsonObjectArray(recentAgentRuns),
		mcp: defaultMcpMetadata(),
		health: fallbackAvailable
			? ({
					status: "degraded",
					service: "news-ecosystem-local-fallback",
					fallback: true,
					report_generated_at: reportDocument?.generated_at || null,
					latest_snapshot_generated_at: snapshotObject?.generated_at || null,
				} as JsonObject)
			: null,
	};
}

async function fetchAiosEndpoint(
	pathname: string,
	responseType: "json" | "text",
	timeoutMs = DEFAULT_TIMEOUT_MS,
) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	const baseUrl = getAiosNewsroomBaseUrl();
	const url = new URL(pathname, `${baseUrl}/`);

	try {
		const response = await fetch(url, {
			method: "GET",
			headers: {
				Accept:
					responseType === "json"
						? "application/json"
						: "text/html, text/plain;q=0.9",
			},
			cache: "no-store",
			signal: controller.signal,
		});

		if (!response.ok) {
			return {
				ok: false,
				status: response.status,
				error: `${response.status} ${response.statusText}`,
				data: null,
			};
		}

		const data =
			responseType === "json"
				? ((await response.json()) as JsonObject | JsonObject[] | null)
				: await response.text();

		return {
			ok: true,
			status: response.status,
			error: null,
			data,
		};
	} catch (error) {
		return {
			ok: false,
			status: 503,
			error: error instanceof Error ? error.message : String(error),
			data: null,
		};
	} finally {
		clearTimeout(timer);
	}
}

export async function getAiosNewsroomSnapshot() {
	const [health, state, metrics, report, agents, runs, agentRuns, mcp] =
		await Promise.all([
		fetchAiosEndpoint("/health", "json"),
		fetchAiosEndpoint("/api/ecosystem/state/latest", "json"),
		fetchAiosEndpoint("/api/ecosystem/metrics/latest", "json"),
		fetchAiosEndpoint("/api/ecosystem/output/report/latest", "json"),
		fetchAiosEndpoint("/api/agents", "json"),
		fetchAiosEndpoint("/api/ecosystem/runs?limit=6", "json"),
		fetchAiosEndpoint("/api/agents/runs?limit=6", "json"),
		fetchAiosEndpoint("/api/ecosystem/mcp", "json"),
	]);
	const localFallback = await loadLocalAiosFallbackData();

	const remoteError =
		health.error ||
		state.error ||
		metrics.error ||
		report.error ||
		agents.error ||
		runs.error ||
		agentRuns.error ||
		mcp.error ||
		null;
	const remoteAvailable = Boolean(
		health.ok && state.ok && metrics.ok && report.ok && agents.ok,
	);
	const usingLocalFallback = !remoteAvailable && localFallback.available;

	return {
		baseUrl: getAiosNewsroomBaseUrl(),
		available: remoteAvailable || localFallback.available,
		error: usingLocalFallback
			? `AIOS service temporarily unavailable, using local cache (${remoteError || "fallback mode"})`
			: remoteError,
		health:
			(health.data as JsonObject | null) ||
			localFallback.health ||
			null,
		state:
			(state.data as JsonObject | null) ||
			localFallback.state ||
			null,
		metrics:
			(metrics.data as JsonObject | null) ||
			localFallback.metrics ||
			null,
		report:
			(report.data as JsonObject | null) ||
			localFallback.report ||
			null,
		agents: Array.isArray(agents.data)
			? (agents.data as JsonObject[])
			: localFallback.agents,
		runs: Array.isArray(runs.data)
			? (runs.data as JsonObject[])
			: localFallback.runs,
		agentRuns: Array.isArray(agentRuns.data)
			? (agentRuns.data as JsonObject[])
			: localFallback.agentRuns,
		mcp: (mcp.data as JsonObject | null) || localFallback.mcp,
	};
}

export async function getAiosNewsroomReportHtml() {
	const response = await fetchAiosEndpoint(
		"/api/ecosystem/output/report/latest/html",
		"text",
	);

	if (!response.ok) {
		const localFallback = await loadLocalAiosFallbackData();
		if (localFallback.reportHtml) {
			return {
				ok: true,
				status: 200,
				error: response.error,
				html: localFallback.reportHtml,
			};
		}
	}

	return {
		ok: response.ok,
		status: response.status,
		error: response.error,
		html: typeof response.data === "string" ? response.data : "",
	};
}

export async function getAiosNewsroomDashboardHtml() {
	const response = await fetchAiosEndpoint("/dashboard", "text");

	if (!response.ok) {
		const localFallback = await loadLocalAiosFallbackData();
		if (localFallback.available) {
			return {
				ok: true,
				status: 200,
				error: response.error,
				html: buildLocalDashboardHtml({
					report: localFallback.report,
					state: localFallback.state,
					metrics: localFallback.metrics,
					latestRun: localFallback.latestRun,
					runs: localFallback.runs,
				}),
			};
		}
	}

	return {
		ok: response.ok,
		status: response.status,
		error: response.error,
		html: typeof response.data === "string" ? response.data : "",
	};
}

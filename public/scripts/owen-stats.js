(function () {
	const API_URL = "/api/stats.json";
	const HIT_KEY_PREFIX = "owen-site-stats-hit:";
	const HIT_DEDUPE_MS = 30 * 60 * 1000;
	const bundleCache = new Map();

	function normalizePath(input) {
		let value = String(input || "").trim() || "/";

		try {
			if (/^https?:\/\//i.test(value)) {
				value = new URL(value).pathname;
			}
		} catch (_error) {
			value = "/";
		}

		value = value.split("?")[0].split("#")[0] || "/";
		if (!value.startsWith("/")) {
			value = `/${value}`;
		}
		value = value.replace(/\/{2,}/g, "/");

		if (!/\.[a-z0-9]+$/i.test(value) && !value.endsWith("/")) {
			value = `${value}/`;
		}

		return value || "/";
	}

	function shouldRecordHit(path) {
		const storageKey = `${HIT_KEY_PREFIX}${path}`;
		const now = Date.now();

		try {
			const previousValue = Number(localStorage.getItem(storageKey) || "0");
			if (previousValue && now - previousValue < HIT_DEDUPE_MS) {
				return false;
			}
			localStorage.setItem(storageKey, String(now));
			return true;
		} catch (_error) {
			return true;
		}
	}

	async function requestJson(target, init) {
		const response = await fetch(target, init);
		const payload = await response.json().catch(function () {
			return {};
		});

		if (!response.ok) {
			const message =
				payload && typeof payload.error === "string"
					? payload.error
					: `Stats request failed with status ${response.status}`;
			throw new Error(message);
		}

		return payload;
	}

	async function loadBundle(path) {
		const normalizedPath = normalizePath(path || window.location.pathname);
		if (bundleCache.has(normalizedPath)) {
			return bundleCache.get(normalizedPath);
		}

		const promise = (shouldRecordHit(normalizedPath)
			? requestJson(API_URL, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						path: normalizedPath,
					}),
				})
			: requestJson(`${API_URL}?path=${encodeURIComponent(normalizedPath)}`)).catch(
			function (error) {
				bundleCache.delete(normalizedPath);
				throw error;
			},
		);

		bundleCache.set(normalizedPath, promise);
		return promise;
	}

	window.__owenStatsClient = {
		getBundle: function (path) {
			return loadBundle(path);
		},
		getPageStats: async function (path) {
			const bundle = await loadBundle(path);
			return bundle.page || { pageviews: 0, visits: 0, visitors: 0 };
		},
		getSiteStats: async function (path) {
			const bundle = await loadBundle(path);
			return bundle.site || { pageviews: 0, visits: 0, visitors: 0 };
		},
	};
})();

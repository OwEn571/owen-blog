import { createHmac, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { getRuntimeDataDir } from "./runtime-env";

const VISITOR_COOKIE_NAME = "owen_visitor";
const VISITOR_COOKIE_MAX_AGE = 60 * 60 * 24 * 180;
const SECRET_FILE_NAME = "visitor-secret.txt";
const VISITOR_ID_PATTERN = /^[a-f0-9]{32}$/i;

let secretPromise: Promise<string> | null = null;

function isProduction() {
	return process.env.NODE_ENV === "production";
}

async function ensureRuntimeDataDir() {
	await mkdir(getRuntimeDataDir(), { recursive: true });
}

async function getOrCreateSecret() {
	if (!secretPromise) {
		secretPromise = (async () => {
			await ensureRuntimeDataDir();
			const secretPath = path.join(getRuntimeDataDir(), SECRET_FILE_NAME);

			try {
				return (await readFile(secretPath, "utf8")).trim();
			} catch (error) {
				if (
					typeof error !== "object" ||
					error === null ||
					!("code" in error) ||
					error.code !== "ENOENT"
				) {
					throw error;
				}
			}

			const nextSecret = `${randomUUID().replace(/-/g, "")}${randomUUID().replace(/-/g, "")}`;
			try {
				await writeFile(secretPath, `${nextSecret}\n`, {
					encoding: "utf8",
					flag: "wx",
				});
				return nextSecret;
			} catch (error) {
				if (
					typeof error !== "object" ||
					error === null ||
					!("code" in error) ||
					error.code !== "EEXIST"
				) {
					throw error;
				}

				return (await readFile(secretPath, "utf8")).trim();
			}
		})();
	}

	return secretPromise;
}

function parseCookieHeader(cookieHeader: string | null) {
	const pairs = new Map<string, string>();
	if (!cookieHeader) {
		return pairs;
	}

	cookieHeader.split(";").forEach((part) => {
		const [name, ...rest] = part.trim().split("=");
		if (!name) {
			return;
		}
		pairs.set(name, decodeURIComponent(rest.join("=") || ""));
	});

	return pairs;
}

function signVisitorId(visitorId: string, secret: string) {
	return createHmac("sha256", secret).update(visitorId).digest("hex");
}

function createVisitorId() {
	return randomUUID().replace(/-/g, "");
}

function readSignedVisitorCookie(request: Request) {
	const cookieValue =
		parseCookieHeader(request.headers.get("cookie")).get(VISITOR_COOKIE_NAME) || "";
	if (!cookieValue.includes(".")) {
		return null;
	}

	const splitIndex = cookieValue.lastIndexOf(".");
	const visitorId = cookieValue.slice(0, splitIndex);
	const signature = cookieValue.slice(splitIndex + 1);
	if (!visitorId || !signature || !VISITOR_ID_PATTERN.test(visitorId)) {
		return null;
	}

	return { visitorId, signature };
}

function serializeVisitorCookie(visitorId: string, signature: string) {
	const parts = [
		`${VISITOR_COOKIE_NAME}=${encodeURIComponent(`${visitorId}.${signature}`)}`,
		"Path=/",
		`Max-Age=${VISITOR_COOKIE_MAX_AGE}`,
		"HttpOnly",
		"SameSite=Lax",
	];

	if (isProduction()) {
		parts.push("Secure");
	}

	return parts.join("; ");
}

export async function resolveTrustedVisitor(request: Request) {
	const secret = await getOrCreateSecret();
	const signedCookie = readSignedVisitorCookie(request);

	if (signedCookie) {
		const expectedSignature = signVisitorId(signedCookie.visitorId, secret);
		if (signedCookie.signature === expectedSignature) {
			return {
				visitorId: signedCookie.visitorId,
				setCookie: null,
			};
		}
	}

	const visitorId = createVisitorId();
	return {
		visitorId,
		setCookie: serializeVisitorCookie(visitorId, signVisitorId(visitorId, secret)),
	};
}

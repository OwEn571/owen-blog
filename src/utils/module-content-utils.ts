import fs from "node:fs/promises";
import path from "node:path";

import type { CollectionEntry } from "astro:content";

import {
	moduleDirectoryPresets,
	moduleEntries,
	type ModuleDirectoryPreset,
	type ModuleDirectoryCardSize,
	type ModuleKey,
} from "../data/module-blueprint";
import type { PostForList } from "./content-utils";
import { getSortedPosts, getSortedPostsList } from "./content-utils";

const POSTS_ROOT = path.resolve(process.cwd(), "src", "content", "posts");

const MODULE_CARD_ACCENTS: Record<ModuleKey, string[]> = {
	study: [
		"116 188 255",
		"110 164 255",
		"132 126 255",
		"154 173 255",
		"102 204 232",
		"94 154 255",
		"138 168 255",
	],
	lab: [
		"140 126 255",
		"120 174 255",
		"172 134 255",
		"102 196 255",
		"110 154 255",
	],
	lounge: [
		"118 196 255",
		"156 146 255",
		"114 170 255",
		"104 204 224",
		"132 144 255",
	],
	archive: [
		"156 174 255",
		"118 176 255",
		"116 196 255",
		"104 162 255",
		"130 148 255",
	],
};

const MODULE_CARD_ICONS: Record<ModuleKey, string[]> = {
	study: [
		"mdi:book-open-page-variant-outline",
		"mdi:brain",
		"mdi:lightning-bolt-outline",
		"mdi:tune-variant",
		"mdi:api",
		"mdi:fire-circle",
	],
	lab: [
		"mdi:flask-outline",
		"mdi:creation-outline",
		"mdi:rocket-launch-outline",
		"mdi:layers-triple-outline",
		"mdi:console-network-outline",
	],
	lounge: [
		"mdi:sofa-outline",
		"mdi:movie-open-outline",
		"mdi:music-circle-outline",
		"mdi:polaroid",
		"mdi:controller-classic-outline",
	],
	archive: [
		"mdi:archive-outline",
		"mdi:link-variant",
		"mdi:download-box-outline",
		"mdi:folder-star-outline",
		"mdi:bookmark-multiple-outline",
	],
};

const MODULE_DEFAULT_EYEBROWS: Record<ModuleKey, string> = {
	study: "Study Topic",
	lab: "Lab Track",
	lounge: "Lounge Track",
	archive: "Archive Shelf",
};

const TITLE_TOKEN_MAP: Record<string, string> = {
	ai: "AI",
	api: "API",
	cv: "CV",
	fastapi: "FastAPI",
	gpu: "GPU",
	llm: "LLM",
	ml: "ML",
	nlp: "NLP",
	oj: "OJ",
	ppo: "PPO",
	py: "Py",
	python: "Python",
	pytorch: "PyTorch",
	rl: "RL",
	sft: "SFT",
	ui: "UI",
	ux: "UX",
};

export interface ModuleDirectoryCard {
	id: string;
	module: ModuleKey;
	directoryName: string;
	eyebrow: string;
	title: string;
	description: string;
	size: ModuleDirectoryCardSize;
	accent: string;
	icon: string;
	contentPrefix: string;
	writePath: string;
	href?: string;
	postCount: number;
	order?: number;
	previewPosts: PostForList[];
	allPosts: PostForList[];
}

interface ModuleDirectoryMeta extends ModuleDirectoryPreset {}

export function getModuleContentPrefix(moduleKey: ModuleKey) {
	return `${moduleKey}/`;
}

export function getModuleWriteRoot(moduleKey: ModuleKey) {
	return `src/content/posts/${moduleKey}/`;
}

export function getModuleDirectoryPrefix(
	moduleKey: ModuleKey,
	directoryName: string,
) {
	return `${moduleKey}/${directoryName}/`;
}

export function getModuleDirectoryCollectionId(
	moduleKey: ModuleKey,
	directoryName: string,
) {
	return `${moduleKey}-collection-${directoryName}`;
}

export function getModuleDirectoryNameFromId(id: string, moduleKey: ModuleKey) {
	if (!isModulePostId(id, moduleKey)) {
		return "";
	}

	const relativeId = id.slice(getModuleContentPrefix(moduleKey).length);
	return relativeId.split("/")[0] ?? "";
}

export function isModulePostId(id: string, moduleKey: ModuleKey) {
	return id.startsWith(getModuleContentPrefix(moduleKey));
}

export function isPostInModuleDirectory(
	id: string,
	moduleKey: ModuleKey,
	directoryName: string,
) {
	return id.startsWith(getModuleDirectoryPrefix(moduleKey, directoryName));
}

export async function getModulePosts(
	moduleKey: ModuleKey,
): Promise<CollectionEntry<"posts">[]> {
	const posts = await getSortedPosts();
	return posts.filter((post) => isModulePostId(post.id, moduleKey));
}

export async function getModulePostsList(
	moduleKey: ModuleKey,
): Promise<PostForList[]> {
	const posts = await getSortedPostsList();
	return posts.filter((post) => isModulePostId(post.id, moduleKey));
}

export async function getModuleDirectoryCards(
	moduleKey: ModuleKey,
	postsList?: PostForList[],
): Promise<ModuleDirectoryCard[]> {
	const directories = await listModuleDirectories(moduleKey);
	const posts = postsList ?? (await getModulePostsList(moduleKey));
	const presetRecord = moduleDirectoryPresets[moduleKey];
	const presetOrder = Object.keys(presetRecord);
	const accentPool = MODULE_CARD_ACCENTS[moduleKey];
	const iconPool = MODULE_CARD_ICONS[moduleKey];
	const directoryConfigs = await Promise.all(
		directories.map(async (directoryName) => {
			const preset = presetRecord[directoryName] ?? {};
			const meta = await readModuleDirectoryMeta(
				moduleKey,
				directoryName,
			);
			return {
				directoryName,
				config: mergeDirectoryConfig(preset, meta),
			};
		}),
	);

	const visibleDirectories = directoryConfigs.filter(
		({ config }) => config.hidden !== true,
	);

	const sortedDirectories = [...visibleDirectories].sort((left, right) => {
		const leftOrder = left.config.order;
		const rightOrder = right.config.order;

		if (leftOrder !== undefined || rightOrder !== undefined) {
			if (leftOrder === undefined) {
				return 1;
			}
			if (rightOrder === undefined) {
				return -1;
			}
			if (leftOrder !== rightOrder) {
				return leftOrder - rightOrder;
			}
		}

		const leftPresetIndex = presetOrder.indexOf(left.directoryName);
		const rightPresetIndex = presetOrder.indexOf(right.directoryName);

		if (leftPresetIndex !== -1 || rightPresetIndex !== -1) {
			if (leftPresetIndex === -1) {
				return 1;
			}
			if (rightPresetIndex === -1) {
				return -1;
			}
			return leftPresetIndex - rightPresetIndex;
		}

		return humanizeDirectoryName(left.directoryName).localeCompare(
			humanizeDirectoryName(right.directoryName),
			"zh-CN",
			{
				numeric: true,
				sensitivity: "base",
			},
		);
	});

	return sortedDirectories.map(({ directoryName, config }, index) => {
		const title = config.title ?? humanizeDirectoryName(directoryName);
		const allPosts = posts.filter((post) =>
			isPostInModuleDirectory(post.id, moduleKey, directoryName),
		);
		const previewPosts = allPosts.slice(0, 3);
		const postCount = allPosts.length;

		return {
			id: directoryName,
			module: moduleKey,
			directoryName,
			eyebrow: config.eyebrow ?? MODULE_DEFAULT_EYEBROWS[moduleKey],
			title,
			description:
				config.description ?? getDefaultDescription(moduleKey, title),
			size: config.size ?? getDefaultCardSize(moduleKey, index),
			accent: config.accent ?? accentPool[index % accentPool.length],
			icon:
				config.icon ??
				iconPool[index % iconPool.length] ??
				getModuleEntry(moduleKey).icon,
			contentPrefix: getModuleDirectoryPrefix(moduleKey, directoryName),
			writePath: `${getModuleWriteRoot(moduleKey)}${directoryName}/`,
			postCount,
			order: config.order,
			previewPosts,
			allPosts,
		};
	});
}

async function listModuleDirectories(moduleKey: ModuleKey) {
	const moduleRoot = path.join(POSTS_ROOT, moduleKey);

	try {
		const entries = await fs.readdir(moduleRoot, { withFileTypes: true });
		return entries
			.filter(
				(entry) => entry.isDirectory() && !entry.name.startsWith("."),
			)
			.map((entry) => entry.name);
	} catch (error) {
		if (isNodeError(error) && error.code === "ENOENT") {
			return [];
		}
		throw error;
	}
}

async function readModuleDirectoryMeta(
	moduleKey: ModuleKey,
	directoryName: string,
): Promise<ModuleDirectoryMeta> {
	const metaPath = path.join(
		POSTS_ROOT,
		moduleKey,
		directoryName,
		"meta.json",
	);

	try {
		const content = await fs.readFile(metaPath, "utf-8");
		const parsed = JSON.parse(content);
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
			return {};
		}

		return parsed as ModuleDirectoryMeta;
	} catch (error) {
		if (
			isNodeError(error) &&
			(error.code === "ENOENT" || error.code === "ENOTDIR")
		) {
			return {};
		}
		if (error instanceof SyntaxError) {
			throw new Error(
				`Invalid meta.json in ${moduleKey}/${directoryName}: ${error.message}`,
			);
		}
		throw error;
	}
}

function mergeDirectoryConfig(
	preset: ModuleDirectoryPreset,
	meta: ModuleDirectoryMeta,
): ModuleDirectoryMeta {
	return {
		...preset,
		...meta,
	};
}

function getModuleEntry(moduleKey: ModuleKey) {
	return (
		moduleEntries.find((entry) => entry.href === `/${moduleKey}/`) ??
		moduleEntries[0]
	);
}

function getDefaultCardSize(
	moduleKey: ModuleKey,
	index: number,
): ModuleDirectoryCardSize {
	if (moduleKey === "study") {
		return index < 2 ? "wide" : "medium";
	}
	return "default";
}

function getDefaultDescription(moduleKey: ModuleKey, title: string) {
	switch (moduleKey) {
		case "study":
			return `在这里写 ${title} 的学习笔记、专题文章和长期整理。`;
		case "lab":
			return `在这里放 ${title} 相关的实验记录、项目拆解和 Demo 文章。`;
		case "lounge":
			return `在这里写 ${title} 相关的随笔、状态和生活片段。`;
		case "archive":
			return `在这里收纳 ${title} 相关的资源、链接和长期索引。`;
	}
}

function humanizeDirectoryName(directoryName: string) {
	return directoryName
		.split(/[-_]+/g)
		.filter(Boolean)
		.map(
			(segment) =>
				TITLE_TOKEN_MAP[segment.toLowerCase()] ?? capitalize(segment),
		)
		.join(" ");
}

function capitalize(value: string) {
	if (!value) {
		return value;
	}
	return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
	return typeof error === "object" && error !== null && "code" in error;
}

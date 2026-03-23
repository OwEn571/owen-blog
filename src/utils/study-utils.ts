import type { CollectionEntry } from "astro:content";

import type { PostForList } from "./content-utils";
import {
	getModulePosts,
	getModulePostsList,
	isPostInModuleDirectory,
	isModulePostId,
} from "./module-content-utils";

export const STUDY_CONTENT_PREFIX = "study/";

export function isStudyPostId(id: string) {
	return isModulePostId(id, "study");
}

export function isPostInStudySection(id: string, sectionPrefix: string) {
	const directoryName = sectionPrefix
		.replace(STUDY_CONTENT_PREFIX, "")
		.replace(/\/+$/, "");
	return isPostInModuleDirectory(id, "study", directoryName);
}

export async function getStudyPosts(): Promise<CollectionEntry<"posts">[]> {
	return getModulePosts("study");
}

export async function getStudyPostsList(): Promise<PostForList[]> {
	return getModulePostsList("study");
}

export async function getStudyTotalWords(): Promise<number> {
	const posts = await getStudyPosts();
	let totalWords = 0;

	for (const post of posts) {
		if (!post.body) {
			continue;
		}

		let text = post.body;
		text = text.replace(/```[\s\S]*?```/g, "");
		text = text.replace(/`[^`]+`/g, "");

		const cjkPattern =
			/[\u4e00-\u9fa5\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af\u3000-\u303f\uff00-\uffef]/g;

		const cjkMatches = text.match(cjkPattern);
		const cjkCount = cjkMatches ? cjkMatches.length : 0;
		const nonCjkText = text.replace(cjkPattern, " ");
		const nonCjkWords = nonCjkText
			.split(/\s+/)
			.filter((word) => word.trim().length > 0);

		totalWords += cjkCount + nonCjkWords.length;
	}

	return totalWords;
}

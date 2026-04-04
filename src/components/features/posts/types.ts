import type { Page } from "astro";
import type { CollectionEntry } from "astro:content";

export interface PostCardProps {
	class?: string;
	entry: CollectionEntry<"posts">;
	preferUpdatedDate?: boolean;
	style?: string;
}

export interface PostMetaProps {
	published: Date;
	updated?: Date;
	category?: string;
	tags?: string[];
	hideUpdateDate?: boolean;
	hideTagsForMobile?: boolean;
	isHome?: boolean;
	className?: string;
	id?: string;
	showOnlyBasicMeta?: boolean;
	words?: number;
	minutes?: number;
	preferUpdatedDate?: boolean;
	showWordCount?: boolean;
}

export interface PostPageProps {
	page: Page<CollectionEntry<"posts">>;
}

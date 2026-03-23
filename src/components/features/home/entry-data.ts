import { moduleEntries } from "../../../data/module-blueprint";

export type HomeSectionEntry = (typeof moduleEntries)[number];

export const homeSections: HomeSectionEntry[] = moduleEntries;

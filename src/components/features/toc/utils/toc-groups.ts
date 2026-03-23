export interface TOCGroup<T extends { id: string; level: number; depth?: number }> {
	parent: T;
	children: T[];
}

export function groupTOCItems<T extends { id: string; level: number; depth?: number }>(
	items: T[],
): TOCGroup<T>[] {
	if (items.length === 0) {
		return [];
	}

	const minLevel = Math.min(...items.map((item) => item.level));
	const groups: TOCGroup<T>[] = [];
	let currentGroup: TOCGroup<T> | null = null;

	for (const item of items) {
		const depth = item.depth ?? item.level - minLevel;

		if (!currentGroup || depth <= 0) {
			currentGroup = { parent: item, children: [] };
			groups.push(currentGroup);
			continue;
		}

		currentGroup.children.push(item);
	}

	return groups;
}

export function findTOCGroupParentId<T extends { id: string; level: number; depth?: number }>(
	groups: TOCGroup<T>[],
	targetId: string,
): string | null {
	for (const group of groups) {
		if (group.parent.id === targetId) {
			return group.parent.id;
		}

		if (group.children.some((child) => child.id === targetId)) {
			return group.parent.id;
		}
	}

	return null;
}

export interface ModuleEntry {
	title: string;
	eyebrow: string;
	href: string;
	icon: string;
	description: string;
	note: string;
	accent: string;
}

export interface ModuleSubsection {
	id: string;
	label: string;
	description: string;
	icon: string;
}

export interface StudyPageContent {
	heroEyebrow: string;
	heroTitle: string;
	heroDescription: string;
	stageBadge: string;
	deckEyebrow: string;
	deckTitle: string;
	deckDescription: string;
	filterEyebrow: string;
	filterTitle: string;
	filterDescription: string;
	metricLabels: {
		published: string;
		words: string;
		views: string;
	};
	pageViewsLoading: string;
	pageViewsUnavailable: string;
	latestLabel: string;
	currentLearning: {
		label: string;
		title: string;
		note: string;
	};
}

export type ModuleKey = "study" | "lab" | "lounge" | "archive";
export type ModuleDirectoryCardSize = "wide" | "medium" | "default";

export interface ModuleDirectoryPreset {
	eyebrow?: string;
	title?: string;
	description?: string;
	size?: ModuleDirectoryCardSize;
	accent?: string;
	icon?: string;
	order?: number;
	hidden?: boolean;
}

export interface StudyTile {
	id: string;
	eyebrow: string;
	title: string;
	description: string;
	size: "wide" | "medium";
	accent: string;
	icon: string;
	contentPrefix: string;
	writePath: string;
}

export interface LabShowcase {
	id: string;
	kicker: string;
	title: string;
	description: string;
	status: string;
	icon: string;
	aspect: "hero" | "wide" | "tall" | "compact";
	accent: string;
	iframeSrc?: string;
	actionLabel: string;
	actionHref: string;
}

export interface LoungeStory {
	id: string;
	type: string;
	title: string;
	description: string;
	meta: string;
	accent: string;
	height: "short" | "medium" | "tall";
}

export interface ArchiveShortcut {
	title: string;
	description: string;
	href?: string;
	icon: string;
	accent: string;
	badge: string;
}

export interface ArchiveResourceGroup {
	title: string;
	description: string;
	items: Array<{
		label: string;
		href: string;
		note: string;
	}>;
}

export const moduleEntries: ModuleEntry[] = [
	{
		title: "Study",
		eyebrow: "学习中枢",
		href: "/study/",
		icon: "mdi:brain",
		description: "我的学习笔记",
		note: "Bento Knowledge Deck",
		accent: "108 166 255",
	},
	{
		title: "Lab",
		eyebrow: "实验室",
		href: "/lab/",
		icon: "mdi:flask-outline",
		description:
			"像 App Store 橱窗一样展示项目、玩具和交互原型，强调可玩性。",
		note: "Showcase Flow",
		accent: "140 126 255",
	},
	{
		title: "Lounge",
		eyebrow: "休息室",
		href: "/lounge/",
		icon: "mdi:sofa-outline",
		description:
			"状态卡、观影游戏随笔和生活碎片会像一面有呼吸感的墙慢慢长出来。",
		note: "Status + Masonry",
		accent: "118 196 255",
	},
	{
		title: "Archive",
		eyebrow: "档案馆",
		href: "/archive/",
		icon: "mdi:archive-outline",
		description:
			"用控制中心与资源面板来整理链接、下载入口和长期沉淀下来的索引。",
		note: "Control Center",
		accent: "156 174 255",
	},
];

export const studyPageContent: StudyPageContent = {
	heroEyebrow: "Study",
	heroTitle: "Study 已经收成真正可写内容的学习分区",
	heroDescription:
		"现在它只做一件事: 承接你的学习型博客。页面会自动扫描 `study/` 下的一级目录，把每个目录变成一张真正可用的写作卡片。",
	stageBadge: "Knowledge Constellation",
	deckEyebrow: "Focus Deck",
	deckTitle: "Study 目录卡片",
	deckDescription:
		"上面的卡片只负责切换主题。点击任意一张，会自动滚动到下面的 Study 全部文章，并筛选出对应目录。",
	filterEyebrow: "Reading Index",
	filterTitle: "Study 全部文章",
	filterDescription:
		"这里是 Study 的唯一文章列表。你可以直接点上面的目录卡片，或者在下面切换筛选器，只看某一个主题目录。",
	metricLabels: {
		published: "已发布文章",
		words: "累计字数",
		views: "浏览量",
	},
	pageViewsLoading: "同步中",
	pageViewsUnavailable: "未接入",
	latestLabel: "Latest Study Post",
	currentLearning: {
		label: "Currently Learning",
		title: "强化学习与 Agent 工作流",
		note: "这里可以直接写你最近在啃的主题、课程、书或者项目状态。",
	},
};

export const moduleSubsections: Record<string, ModuleSubsection[]> = {
	study: [
		{
			id: "study-focus",
			label: "Focus Deck",
			description: "知识主题与进入点",
			icon: "mdi:view-grid-outline",
		},
		{
			id: "study-notes",
			label: "Reading Index",
			description: "全部文章与分页",
			icon: "mdi:notebook-outline",
		},
		{
			id: "study-series",
			label: "Series",
			description: "专题与路径规划",
			icon: "mdi:map-marker-path",
		},
		{
			id: "study-archive",
			label: "Archive",
			description: "回到完整归档",
			icon: "mdi:archive-arrow-down-outline",
		},
	],
	lab: [
		{
			id: "lab-showcase",
			label: "Featured",
			description: "主橱窗与互动试玩",
			icon: "mdi:cards-outline",
		},
		{
			id: "lab-shelf",
			label: "Shelf",
			description: "轻量实验与构建日志",
			icon: "mdi:view-grid-outline",
		},
		{
			id: "lab-runtime",
			label: "Runtime",
			description: "代码、部署与演示方式",
			icon: "mdi:server-outline",
		},
		{
			id: "lab-roadmap",
			label: "Roadmap",
			description: "之后准备接入的互动能力",
			icon: "mdi:rocket-launch-outline",
		},
	],
	lounge: [
		{
			id: "lounge-status",
			label: "Status",
			description: "正在进行的游戏/观影状态",
			icon: "mdi:account-circle-outline",
		},
		{
			id: "lounge-wall",
			label: "Masonry",
			description: "随笔、评论与照片墙",
			icon: "mdi:view-dashboard-variant-outline",
		},
		{
			id: "lounge-notes",
			label: "Notes",
			description: "短评与微小记录",
			icon: "mdi:note-multiple-outline",
		},
		{
			id: "lounge-memory",
			label: "Memory",
			description: "以后可接日记与相册",
			icon: "mdi:polaroid",
		},
	],
	archive: [
		{
			id: "archive-shortcuts",
			label: "Control Grid",
			description: "大图标入口与外链",
			icon: "mdi:view-grid-plus-outline",
		},
		{
			id: "archive-resource",
			label: "Resources",
			description: "常用工具与下载面板",
			icon: "mdi:link-variant",
		},
		{
			id: "archive-filters",
			label: "Filters",
			description: "按标签与分类浏览",
			icon: "mdi:tune-variant",
		},
		{
			id: "archive-timeline",
			label: "Timeline",
			description: "回到完整时间归档",
			icon: "mdi:timeline-outline",
		},
	],
};

export const studyTiles: StudyTile[] = [
	{
		id: "python-base",
		eyebrow: "Language",
		title: "Python Base",
		description: "Python 基础、语法、标准库和常用脚本整理。",
		size: "wide",
		accent: "116 188 255",
		icon: "mdi:language-python",
		contentPrefix: "study/python-base/",
		writePath: "src/content/posts/study/python-base/",
	},
	{
		id: "llm-base",
		eyebrow: "Core Models",
		title: "LLM Base",
		description: "LLM 基础、Transformer、推理机制和模型学习笔记。",
		size: "wide",
		accent: "110 164 255",
		icon: "mdi:brain",
		contentPrefix: "study/llm-base/",
		writePath: "src/content/posts/study/llm-base/",
	},
	{
		id: "hot-100",
		eyebrow: "Algorithm",
		title: "Hot 100",
		description: "LeetCode Hot 100、题解、思路拆解和刷题复盘。",
		size: "medium",
		accent: "132 126 255",
		icon: "mdi:lightning-bolt-outline",
		contentPrefix: "study/hot-100/",
		writePath: "src/content/posts/study/hot-100/",
	},
	{
		id: "fine-tuning",
		eyebrow: "Training",
		title: "Fine Tuning",
		description: "LoRA、SFT、指令微调、数据集与训练流程总结。",
		size: "medium",
		accent: "154 173 255",
		icon: "mdi:tune-variant",
		contentPrefix: "study/fine-tuning/",
		writePath: "src/content/posts/study/fine-tuning/",
	},
	{
		id: "fastapi",
		eyebrow: "Backend",
		title: "FastAPI",
		description: "FastAPI 接口开发、鉴权、部署和服务化实践。",
		size: "medium",
		accent: "102 204 232",
		icon: "mdi:api",
		contentPrefix: "study/fastapi/",
		writePath: "src/content/posts/study/fastapi/",
	},
	{
		id: "pytorch",
		eyebrow: "Framework",
		title: "Pytorch",
		description: "PyTorch 张量、训练循环、实验记录和工程化笔记。",
		size: "medium",
		accent: "94 154 255",
		icon: "mdi:fire-circle",
		contentPrefix: "study/pytorch/",
		writePath: "src/content/posts/study/pytorch/",
	},
	{
		id: "reinforce-learning",
		eyebrow: "RL",
		title: "Reinforce Learning",
		description: "强化学习、DQN、PPO、策略梯度等内容。",
		size: "medium",
		accent: "138 168 255",
		icon: "mdi:robot-outline",
		contentPrefix: "study/reinforce-learning/",
		writePath: "src/content/posts/study/reinforce-learning/",
	},
];

export const labShowcases: LabShowcase[] = [
	{
		id: "singularity-ui",
		kicker: "Featured Prototype",
		title: "Singularity UI Study",
		description:
			"一块可直接试玩的交互卡，后面可以继续放前端实验、组件互动和视觉小说 demo。",
		status: "Interactive",
		icon: "mdi:creation-outline",
		aspect: "hero",
		accent: "136 128 255",
		iframeSrc: "/demos/lab-orbit.html",
		actionLabel: "Open Demo",
		actionHref: "/lab/#lab-showcase",
	},
	{
		id: "oj-sprint",
		kicker: "Build Log",
		title: "OJ Review Sprint",
		description: "适合放算法训练回顾、做题工作流和结构化总结。",
		status: "In Progress",
		icon: "mdi:lightning-bolt-outline",
		aspect: "wide",
		accent: "120 174 255",
		actionLabel: "Read Logs",
		actionHref: "/study/",
	},
	{
		id: "novel-engine",
		kicker: "Visual Novel",
		title: "Narrative Engine Demo",
		description:
			"视觉小说开发、剧情分支与 UI 试验可以像商品卡片一样单独出场。",
		status: "Playable",
		icon: "mdi:star-four-points-outline",
		aspect: "tall",
		accent: "180 136 255",
		actionLabel: "View Concept",
		actionHref: "/lab/#lab-runtime",
	},
	{
		id: "python-runtime",
		kicker: "Tools",
		title: "Python Runtime Cards",
		description:
			"以后可以把 Python 可运行代码块、数据脚本与实验笔记挂到这里。",
		status: "Planned",
		icon: "mdi:language-python",
		aspect: "compact",
		accent: "102 196 255",
		actionLabel: "See Plan",
		actionHref: "/lab/#lab-roadmap",
	},
];

export const labShelf = [
	{
		title: "Prompt Playground",
		description: "适合放 Prompt 模板、对比实验和模型观察结果。",
		meta: "Cards / Markdown / Preview",
	},
	{
		title: "Interaction Widgets",
		description: "适合收纳 hover、滚动、磁吸、微交互等前端小玩具。",
		meta: "Motion / Pointer / Surface",
	},
	{
		title: "Deploy Recipes",
		description: "把部署、构建、自动同步与域名接入整理成模块化清单。",
		meta: "Tencent Cloud / CI / Domain",
	},
];

export const loungeStatus = {
	label: "Currently Playing",
	title: "Blue Archive / 或者你正在玩的游戏",
	description:
		"这里可以接腾讯云 COS 的封面图与文字状态，形成一个像 Discord 一样的悬浮状态卡。",
	meta: "COS Poster Slot",
};

export const loungeStories: LoungeStory[] = [
	{
		id: "story-01",
		type: "Game Note",
		title: "把游戏情绪写成一张能停留的卡片",
		description:
			"比起单纯的日记条目，这里更像带着海报、色调和状态的生活截图。",
		meta: "Tonight / 23:40",
		accent: "118 196 255",
		height: "tall",
	},
	{
		id: "story-02",
		type: "Mini Review",
		title: "一段很短但很准的漫评",
		description:
			"用更少的字保留情绪密度，适合装下看完之后第一时间想写下的句子。",
		meta: "Anime / Review",
		accent: "156 146 255",
		height: "medium",
	},
	{
		id: "story-03",
		type: "Daily Fragment",
		title: "今天的几张截图和一点点心情",
		description:
			"可以作为日记和动态之间的灰度区域，既不像正式博客，也不是纯时间流。",
		meta: "Photo / Notes",
		accent: "114 170 255",
		height: "medium",
	},
	{
		id: "story-04",
		type: "Desk Scene",
		title: "桌面、播放器、游戏封面和夜里的灯",
		description: "宝丽来感的卡片适合放更生活化的内容，让这个分区更有体温。",
		meta: "Room / Setup",
		accent: "104 204 224",
		height: "short",
	},
	{
		id: "story-05",
		type: "Pinned Thought",
		title: "休息室也应该保留一点长段落",
		description:
			"这里适合写那些不值得单独开一篇博客、但又希望被留住的想法。",
		meta: "Pinned",
		accent: "132 144 255",
		height: "tall",
	},
	{
		id: "story-06",
		type: "Weekend",
		title: "周末观影/通关/阅读记录",
		description: "瀑布流会把这些内容变得像一本在慢慢翻的私人杂志。",
		meta: "Weekend Log",
		accent: "154 180 255",
		height: "medium",
	},
];

export const archiveShortcuts: ArchiveShortcut[] = [
	{
		title: "Bilibili",
		description: "直接跳到你的视频外链入口。",
		href: "https://space.bilibili.com/162577988",
		icon: "mdi:play-circle-outline",
		accent: "118 176 255",
		badge: "External",
	},
	{
		title: "RSS Feed",
		description: "把更新流和长文输出交给订阅器。",
		href: "/rss.xml",
		icon: "mdi:rss-box",
		accent: "116 196 255",
		badge: "Feed",
	},
	{
		title: "Sitemap",
		description: "给搜索引擎和自己看的站点总索引。",
		href: "/sitemap-index.xml",
		icon: "mdi:sitemap-outline",
		accent: "156 168 255",
		badge: "Index",
	},
	{
		title: "Study Notes",
		description: "回到知识卡片与文章主入口。",
		href: "/study/",
		icon: "mdi:book-open-page-variant-outline",
		accent: "104 162 255",
		badge: "Internal",
	},
];

export const archiveResourceGroups: ArchiveResourceGroup[] = [
	{
		title: "Quick Panels",
		description: "适合放常用工具、下载入口和固定收藏。",
		items: [
			{ label: "文章归档", href: "/archive/", note: "Timeline / Year" },
			{ label: "全部文章", href: "/study/", note: "Long-form / Notes" },
			{ label: "实验室", href: "/lab/", note: "Showcase / Demo" },
		],
	},
	{
		title: "Module Links",
		description: "四个模块之间的快速切换层。",
		items: [
			{ label: "Study", href: "/study/", note: "Bento UI" },
			{ label: "Lounge", href: "/lounge/", note: "Status / Masonry" },
			{ label: "Lab", href: "/lab/", note: "App Store Flow" },
		],
	},
];

export const moduleDirectoryPresets: Record<
	ModuleKey,
	Record<string, ModuleDirectoryPreset>
> = {
	study: Object.fromEntries(
		studyTiles.map((tile) => [
			tile.id,
			{
				eyebrow: tile.eyebrow,
				title: tile.title,
				description: tile.description,
				size: tile.size,
				accent: tile.accent,
				icon: tile.icon,
			},
		]),
	),
	lab: {},
	lounge: {},
	archive: {},
};

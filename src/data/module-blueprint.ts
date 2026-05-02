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
	stack: string[];
	highlights: string[];
	metrics: Array<{
		label: string;
		value: string;
	}>;
}

export interface LabFeaturePillar {
	title: string;
	description: string;
	icon: string;
	accent: string;
}

export interface LabShelfCard {
	title: string;
	description: string;
	meta: string;
	icon: string;
	accent: string;
	status: string;
	tags: string[];
}

export interface LabSeedIdea {
	title: string;
	description: string;
	path: string;
	icon: string;
	accent: string;
}

export interface LabRoadmapStep {
	step: string;
	title: string;
	description: string;
	badge: string;
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
	heroTitle: "Study 是我的学习博客分区",
	heroDescription:
		"这里汇总算法、模型与工程学习笔记。上方知识星点图对应不同主题，下面可以直接筛选并进入文章。",
	stageBadge: "Knowledge Constellation",
	deckEyebrow: "Knowledge Map",
	deckTitle: "Study 主题星图",
	deckDescription:
		"点击任意节点，会直接滚动到下面的文章列表，并筛选出对应目录。",
	filterEyebrow: "Reading Index",
	filterTitle: "Study 全部文章",
	filterDescription:
		"这里是 Study 的唯一文章列表。你可以直接点上面的知识星点，或者在下面切换筛选器，只看某一个主题目录。",
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
		contentPrefix: "study/算法题/",
		writePath: "src/content/posts/study/算法题/",
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
		id: "aios-newsroom",
		kicker: "主力系统",
		title: "AIOS Newsroom",
		description:
			"把 AIOS kernel、news workflow、dashboard、workflow memory 和动态 agent registry 接成一套真正在线运行的 agent ecosystem。",
		status: "在线运行",
		icon: "mdi:hub-outline",
		aspect: "hero",
		accent: "86 168 255",
		iframeSrc: "/demos/lab-orbit.html",
		actionLabel: "进入项目页",
		actionHref: "/lab/aios-newsroom/",
		stack: [
			"AIOS 内核",
			"工作流状态",
			"动态 Agents",
			"HTML 日报",
		],
		highlights: [
			"服务器常驻运行的 AIOS runtime",
			"日报主线可完整跑通，并保留 state / metrics / snapshot",
			"中间产物与 workflow memory 正在逐步 AIOS 化",
		],
		metrics: [
			{ label: "Mode", value: "Remote Kernel" },
			{ label: "Shape", value: "Agent Ecosystem" },
			{ label: "Output", value: "HTML + JSON" },
		],
	},
	{
		id: "zotero-paper-rag",
		kicker: "检索实验",
		title: "Zotero Paper Agent",
		description:
			"把 Zotero 本地论文库、BM25 + Dense 检索、Milvus 向量库和可追溯证据链做成一套真正能在线对话的研究控制台。",
		status: "V4 在线",
		icon: "mdi:file-document-multiple-outline",
		aspect: "wide",
		accent: "86 206 178",
		iframeSrc: "/api/lab/zotero-paper-rag/ui/chat/",
		actionLabel: "进入项目页",
		actionHref: "/lab/zotero-paper-rag/",
		stack: ["Zotero", "Milvus", "Agent Loop", "流式前端"],
		highlights: [
			"V4 前端已经可用，可直接进行多轮论文问答和歧义澄清",
			"索引保留 layout-aware 的表格、图注和正文块，回答可追溯到引用片段",
			"左侧 Zotero 库、Agent 轨迹、候选论文、证据与 PDF 预览在同一界面里联动",
		],
		metrics: [
			{ label: "State", value: "V4 Online" },
			{ label: "Surface", value: "Agent Console" },
			{ label: "Retrieval", value: "BM25 + Dense" },
		],
	},
	{
		id: "agent-sandbox",
		kicker: "Agent 系统",
		title: "Agent Sandbox",
		description:
			"多 agent 编排、memory、trace、tool routing 和评测台，都会更适合在这里做成可以浏览的系统样机。",
		status: "建设中",
		icon: "mdi:robot-excited-outline",
		aspect: "tall",
		accent: "255 156 96",
		actionLabel: "查看预留位",
		actionHref: "/lab/#lab-shelf",
		stack: ["规划器", "工具", "轨迹", "记忆"],
		highlights: [
			"适合放多 agent demo 和失败复盘",
			"也能承接你之后的 Agent 面试项目展示",
		],
		metrics: [
			{ label: "State", value: "Building" },
			{ label: "Focus", value: "Coordination" },
			{ label: "Next", value: "Trace UI" },
		],
	},
	{
		id: "eval-console",
		kicker: "评测界面",
		title: "Eval & Replay Console",
		description:
			"不是所有实验都要做成完整产品。这个坑位用来放 prompt 对比、rerun 结果、评测快照和回放面板。",
		status: "规划中",
		icon: "mdi:chart-timeline-variant-shimmer",
		aspect: "compact",
		accent: "158 142 255",
		actionLabel: "查看路线图",
		actionHref: "/lab/#lab-roadmap",
		stack: ["回放", "评分", "差异对比", "说明"],
		highlights: [
			"更适合承接小而频繁的实验结果",
			"可以和之后的 RAG / Agent 评测视图统一",
		],
		metrics: [
			{ label: "Surface", value: "Metrics First" },
			{ label: "Purpose", value: "Compare & Replay" },
			{ label: "State", value: "Planned" },
		],
	},
];

export const labFeaturePillars: LabFeaturePillar[] = [
	{
		title: "Live Surface",
		description: "不是只放截图，而是尽量让系统、卡片或局部交互真的能被点开和浏览。",
		icon: "mdi:monitor-dashboard",
		accent: "86 168 255",
	},
	{
		title: "Build Journal",
		description: "每个系统旁边都应该留有构建路径、复盘、失败记录和架构说明，而不是只看结果图。",
		icon: "mdi:notebook-edit-outline",
		accent: "255 156 96",
	},
	{
		title: "Runtime Trace",
		description: "部署方式、接口入口、状态指标和可观测性，会逐步成为每个 Lab 项目的一部分。",
		icon: "mdi:pulse",
		accent: "86 206 178",
	},
];

export const labShelf: LabShelfCard[] = [
	{
		title: "Live Demo Card",
		description:
			"适合挂真正可操作的页面、嵌入式预览和交互面板，让人点进来就能感受到这个系统在干什么。",
		meta: "Demo / Preview / Interaction",
		icon: "mdi:cursor-default-click-outline",
		accent: "86 168 255",
		status: "Shipping Pattern",
		tags: ["Preview", "Runnable", "Frontend Surface"],
	},
	{
		title: "Build Notes Card",
		description:
			"不是把实现过程藏起来，而是让每个项目都带着架构讲解、踩坑记录和失败复盘一起出现。",
		meta: "Architecture / Refactor / Failure Log",
		icon: "mdi:file-document-edit-outline",
		accent: "255 156 96",
		status: "Write Alongside",
		tags: ["Narrative", "Refactor", "Postmortem"],
	},
	{
		title: "Infra Snapshot Card",
		description:
			"部署方式、运行入口、接口地址、服务拆分和观测信息会整理成一张更工程化的系统卡片。",
		meta: "Deploy / Runtime / Monitoring",
		icon: "mdi:server-network-outline",
		accent: "86 206 178",
		status: "System View",
		tags: ["Server", "API", "Observability"],
	},
	{
		title: "Eval Snapshot Card",
		description:
			"当项目开始追踪指标时，这里会显示对比、评分、版本变化和 rerun 结果，而不是一段空泛结论。",
		meta: "Metrics / Diff / Replay",
		icon: "mdi:chart-box-outline",
		accent: "158 142 255",
		status: "Metrics View",
		tags: ["Score", "Compare", "Replay"],
	},
];

export const labDirectorySeeds: LabSeedIdea[] = [
	{
		title: "AIOS Newsroom",
		description:
			"给这次 AIOS 项目留一组专属目录，后面可以同时挂架构文、实验复盘和前端展示页。",
		path: "src/content/posts/lab/aios-newsroom/",
		icon: "mdi:hub-outline",
		accent: "86 168 255",
	},
	{
		title: "RAG Workbench",
		description:
			"适合接入分块、检索、重排和评测实验，把 Study 里的知识变成可看的系统工作台。",
		path: "src/content/posts/lab/rag-workbench/",
		icon: "mdi:database-search-outline",
		accent: "86 206 178",
	},
	{
		title: "Agent Sandbox",
		description:
			"适合放 agent 协作、tool routing、memory、trace 和控制面实验。",
		path: "src/content/posts/lab/agent-sandbox/",
		icon: "mdi:robot-excited-outline",
		accent: "255 156 96",
	},
];

export const labRoadmap: LabRoadmapStep[] = [
	{
		step: "Step 01",
		title: "把 AIOS Newsroom 正式挂成第一张 Lab 主卡",
		description:
			"先把这次 AIOS 项目的日报、dashboard、agent registry 和架构说明收进一套真正能浏览的 Lab 展示页。",
		badge: "Now",
	},
	{
		step: "Step 02",
		title: "做一组 RAG 与 Agent 的可比较演示页",
		description:
			"不是只放一份结论，而是让 chunking、retriever、memory、tool routing 这些差异能在前端被直接比较。",
		badge: "Next",
	},
	{
		step: "Step 03",
		title: "给每个实验项目接真实状态和指标",
		description:
			"让卡片显示最近更新时间、运行方式、服务状态、关键指标和关联文章，把 Lab 从海报墙推进成真正的系统陈列架。",
		badge: "Later",
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

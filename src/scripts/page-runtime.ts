import { initBackToTopHandler } from "./handlers/back-to-top-handler";
import { initFancybox } from "./handlers/fancybox-handler";
import { checkKatex, initCustomScrollbar } from "./handlers/scroll-handler";

let initialized = false;

export async function initPageRuntime(): Promise<void> {
	if (initialized) {
		return;
	}
	initialized = true;

	const bannerEnabled = !!document.getElementById("banner-wrapper");

	initBackToTopHandler(bannerEnabled);
	initCustomScrollbar();
	checkKatex();

	try {
		await initFancybox();
	} catch (error) {
		console.error("PageRuntime: fancybox init failed", error);
	}
}

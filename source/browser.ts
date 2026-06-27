import process from 'node:process';
import * as path from 'node:path';
import {readFileSync} from 'node:fs';
import {webFrame} from 'electron';
import {ipcRenderer as ipc} from 'electron-better-ipc';
import {is} from 'electron-util';
import elementReady from 'element-ready';
import {nativeTheme} from '@electron/remote';
import selectors from './browser/selectors';
import {toggleVideoAutoplay} from './autoplay';
import {sendConversationList} from './browser/conversation-list';
import {IToggleSounds, IToggleMuteNotifications} from './types';

type ThemeSource = typeof nativeTheme.themeSource;
type CustomMenuBarItem = {
	index: number;
	label: string;
	enabled: boolean;
};

const startupSplashStartedAt = Date.now();
const startupSplashMinimumDuration = 5000;
const startupSplashMaximumDuration = 10_000;
let startupSplashCreated = false;
let startupSplashDismissed = false;

function loadStaticImageDataUrl(name: string): string {
	const buffer = readFileSync(path.join(__dirname, '..', 'static', name));
	return `data:image/png;base64,${buffer.toString('base64')}`;
}

// Inject critical CSS immediately in preload to prevent Facebook chrome from flashing in.
webFrame.insertCSS(`
	html::-webkit-scrollbar {
		display: none !important;
	}

	[role="banner"] {
		display: none !important;
	}

	[data-pagelet="CometRoot"] > div:first-child:has(a[aria-label="Facebook"], [aria-label="Home"], [aria-label="Watch"], [aria-label="Marketplace"], [aria-label="Groups"], [aria-label="Gaming"]) {
		display: none !important;
	}

	:root,
	.__fb-light-mode,
	.__fb-dark-mode {
		--header-height: 0 !important;
		--messenger-card-spacing: 0 !important;
	}

	html.caprine-startup-splash-pending body > :not(#caprine-startup-splash) {
		visibility: hidden !important;
	}

	#caprine-startup-splash {
		position: fixed;
		inset: 0;
		z-index: 2147483647;
		display: grid;
		place-items: center;
		background: #18191a;
		color: #f0f2f5;
		font-family: "Segoe UI", system-ui, sans-serif;
		pointer-events: auto;
		user-select: none;
	}

	#caprine-startup-splash.caprine-startup-splash-hidden {
		opacity: 0;
		pointer-events: none;
		transition: opacity 180ms ease;
	}

	#caprine-startup-splash-content {
		display: grid;
		justify-items: center;
		gap: 20px;
		opacity: 0;
		transform: translateY(8px) scale(.98);
		animation: caprine-startup-splash-in 180ms ease-out forwards;
	}

	#caprine-startup-splash img {
		width: 172px;
		height: 172px;
		object-fit: contain;
	}

	#caprine-startup-splash-title {
		font-size: 38px;
		font-weight: 700;
		letter-spacing: 0;
	}

	#caprine-startup-splash-spinner {
		width: 34px;
		height: 34px;
		margin-top: 4px;
		border: 3px solid rgba(240, 242, 245, .22);
		border-top-color: #1877f2;
		border-radius: 50%;
		animation: caprine-startup-spinner 780ms linear infinite;
	}

	@keyframes caprine-startup-splash-in {
		to {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
	}

	@keyframes caprine-startup-spinner {
		to {
			transform: rotate(360deg);
		}
	}
`);
webFrame.insertCSS(`
	#caprine-custom-menu-bar {
		position: fixed;
		top: 0;
		left: 0;
		right: 108px;
		z-index: 1000000;
		display: none;
		align-items: center;
		height: 22px;
		box-sizing: border-box;
		padding: 0 0 0 8px;
		background: #242526;
		color: #f0f2f5;
		font: 13px "Segoe UI", sans-serif;
		pointer-events: none;
		-webkit-app-region: no-drag;
	}

	#caprine-custom-menu-bar.caprine-custom-menu-bar-visible {
		display: flex;
	}

	html.caprine-custom-menu-bar-open::before {
		content: "";
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		z-index: 999999;
		height: 22px;
		background: #242526;
		pointer-events: none;
	}

	#caprine-custom-menu-bar button {
		height: 22px;
		margin: 0;
		padding: 0 10px;
		border: 0;
		border-radius: 0;
		background: transparent;
		color: inherit;
		font: inherit;
		line-height: 22px;
		-webkit-app-region: no-drag;
	}

	#caprine-custom-menu-items {
		display: flex;
		align-items: center;
		height: 100%;
		pointer-events: auto;
		-webkit-app-region: no-drag;
	}

	#caprine-custom-menu-bar button:disabled {
		opacity: .45;
	}

	#caprine-custom-menu-bar button:not(:disabled):hover {
		background: rgba(255, 255, 255, .14);
	}

	#caprine-custom-menu-bar button:focus {
		outline: 0;
	}

	#caprine-window-controls {
		position: fixed;
		top: 0;
		right: 0;
		z-index: 1000002;
		display: flex;
		height: 32px;
		pointer-events: auto;
		-webkit-app-region: no-drag !important;
	}

	.caprine-window-control {
		position: relative;
		z-index: 1000003;
		width: 36px;
		height: 22px;
		margin: 0;
		padding: 0;
		border: 0;
		border-radius: 0;
		background: transparent;
		color: #f0f2f5;
		font-size: 0;
		line-height: 22px;
		text-align: center;
		pointer-events: auto;
		-webkit-app-region: no-drag !important;
	}

	.caprine-window-control::before,
	.caprine-window-control::after {
		content: "";
		position: absolute;
		left: 50%;
		top: 50%;
		box-sizing: border-box;
		transform: translate(-50%, -50%);
	}

	#caprine-window-minimize::before {
		width: 10px;
		height: 1px;
		background: currentColor;
	}

	#caprine-window-maximize::before {
		width: 10px;
		height: 10px;
		border: 1px solid currentColor;
	}

	#caprine-window-close::before,
	#caprine-window-close::after {
		width: 13px;
		height: 1px;
		background: currentColor;
	}

	#caprine-window-close::before {
		transform: translate(-50%, -50%) rotate(45deg);
	}

	#caprine-window-close::after {
		transform: translate(-50%, -50%) rotate(-45deg);
	}

	.caprine-window-control:hover {
		background: rgba(255, 255, 255, .22) !important;
	}

	.caprine-window-control-close:hover {
		background: #e81123 !important;
		color: #fff !important;
	}

	html.caprine-media-viewer-open #caprine-window-minimize,
	html.caprine-media-viewer-open #caprine-window-maximize,
	html.caprine-media-viewer-open #caprine-window-close {
		display: none;
	}

	html.caprine-custom-menu-bar-open [role="navigation"]:has([role="grid"]) {
		transform: translateY(22px);
	}

	html.caprine-custom-menu-bar-open [role="main"],
	html.caprine-custom-menu-bar-open [role="complementary"] {
		transform: translateY(22px);
	}

	.caprine-sidebar-brand {
		position: relative !important;
		display: inline-block !important;
		padding-left: 42px !important;
	}

	.caprine-sidebar-brand-icon {
		position: absolute !important;
		top: calc(50% + 2px) !important;
		left: 6px !important;
		width: 26px !important;
		height: 26px !important;
		max-width: 26px !important;
		max-height: 26px !important;
		border-radius: 6px !important;
		object-fit: cover !important;
		transform: translateY(-50%) !important;
	}

`);

webFrame.executeJavaScript(
	readFileSync(path.join(__dirname, 'notifications-isolated.js'), 'utf8'),
);

function ensureStartupSplash(): boolean {
	if (!is.windows || startupSplashCreated || startupSplashDismissed || document.querySelector('#caprine-startup-splash')) {
		return true;
	}

	startupSplashCreated = true;
	const parent = document.body ?? document.documentElement;
	if (!parent) {
		startupSplashCreated = false;
		return false;
	}

	try {
		const splash = document.createElement('div');
		splash.id = 'caprine-startup-splash';
		splash.innerHTML = `
			<div id="caprine-startup-splash-content">
				<img src="${loadStaticImageDataUrl('IconSplash.png')}" alt="">
				<div id="caprine-startup-splash-title">Caprine</div>
				<div id="caprine-startup-splash-spinner" aria-hidden="true"></div>
			</div>
		`;

		document.documentElement.classList.add('caprine-startup-splash-pending');
		parent.append(splash);
		return true;
	} catch {
		startupSplashCreated = false;
		document.documentElement.classList.remove('caprine-startup-splash-pending');
		return false;
	}
}

function isMessengerReadyForSplashDismissal(): boolean {
	if (location.pathname.startsWith('/login') || document.querySelector('input[type="password"]')) {
		return true;
	}

	hideFacebookTopChrome();

	const conversationList = document.querySelector('[role="navigation"]:has([role="grid"])');
	const conversationRows = conversationList?.querySelectorAll('[role="row"], [role="gridcell"], a[href*="/messages/"]').length ?? 0;
	const mainPane = document.querySelector('[role="main"]');
	const hasComposer = Boolean(
		mainPane?.querySelector('[contenteditable="true"], textarea, [role="textbox"]')
		?? mainPane?.textContent?.toLowerCase().includes('message'),
	);
	const hasConversationHeader = Boolean(
		mainPane?.querySelector('h1, h2, h3, [aria-label*="audio" i], [aria-label*="video" i], [aria-label*="conversation information" i]'),
	);
	const hasVisibleLoadingText = /\b(loading|loading chats|loading messages)\b/i.test(document.body.textContent ?? '');
	const hasVisibleFacebookBanner = [...document.querySelectorAll<HTMLElement>('[role="banner"]')]
		.some(element => {
			const style = window.getComputedStyle(element);
			const bounds = element.getBoundingClientRect();
			return style.display !== 'none'
				&& style.visibility !== 'hidden'
				&& Number.parseFloat(style.opacity || '1') > 0
				&& bounds.width > 0
				&& bounds.height > 0;
		});

	return Boolean(
		conversationList
		&& conversationRows > 0
		&& mainPane
		&& (hasComposer || hasConversationHeader)
		&& !hasVisibleLoadingText
		&& !hasVisibleFacebookBanner,
	);
}

function dismissStartupSplash(): void {
	if (startupSplashDismissed) {
		return;
	}

	startupSplashDismissed = true;
	window.clearInterval(startupSplashCheckInterval);
	document.documentElement.classList.remove('caprine-startup-splash-pending');
	ipc.callMain('startup-splash-ready');
	const splash = document.querySelector<HTMLElement>('#caprine-startup-splash');
	if (!splash) {
		return;
	}

	splash.classList.add('caprine-startup-splash-hidden');
	setTimeout(() => {
		splash.remove();
	}, 220);
}

function maybeDismissStartupSplash(): void {
	const elapsed = Date.now() - startupSplashStartedAt;
	if (elapsed < startupSplashMinimumDuration) {
		return;
	}

	if (elapsed < startupSplashMaximumDuration && !isMessengerReadyForSplashDismissal()) {
		return;
	}

	dismissStartupSplash();
}

const startupSplashCheckInterval = window.setInterval(() => {
	ensureStartupSplash();
	maybeDismissStartupSplash();
	if (startupSplashDismissed || !document.querySelector('#caprine-startup-splash')) {
		window.clearInterval(startupSplashCheckInterval);
	}
}, 150);
ensureStartupSplash();

async function withMenu(
	menuButtonElement: HTMLElement,
	callback: () => Promise<void> | void,
): Promise<void> {
	// Click the menu button
	menuButtonElement.click();

	// Wait for menu items to actually render
	await elementReady(`${selectors.conversationMenuSelectorNewDesign} [role=menuitem]`, {
		stopOnDomReady: false,
	});

	// Additional wait to ensure all menu items are fully rendered and positioned
	await new Promise(resolve => {
		setTimeout(resolve, 100);
	});

	// Execute callback to click the desired menu item
	await callback();
}

let customMenuBarElement: HTMLElement | undefined;
let customMenuBarVisible = false;

function setCustomMenuBarVisible(visible: boolean): void {
	customMenuBarVisible = visible;
	customMenuBarElement?.classList.toggle('caprine-custom-menu-bar-visible', visible);
	document.documentElement.classList.toggle('caprine-custom-menu-bar-open', visible);
}

async function popupCustomMenuBarItem(button: HTMLButtonElement, index: number): Promise<void> {
	const rectangle = button.getBoundingClientRect();
	await ipc.callMain('popup-custom-menu-bar-item', {
		index,
		x: rectangle.left,
		y: rectangle.bottom,
	});
}

async function createCustomMenuBar(): Promise<void> {
	if (!is.windows || customMenuBarElement) {
		return;
	}

	const menuItems = await ipc.callMain<undefined, CustomMenuBarItem[]>('get-custom-menu-bar-items');
	const menuBarElement = document.createElement('nav');
	menuBarElement.id = 'caprine-custom-menu-bar';
	menuBarElement.setAttribute('aria-label', 'Application menu');
	const menuItemsElement = document.createElement('div');
	menuItemsElement.id = 'caprine-custom-menu-items';

	for (const menuItem of menuItems) {
		const button = document.createElement('button');
		button.type = 'button';
		button.textContent = menuItem.label;
		button.disabled = !menuItem.enabled;
		button.addEventListener('click', async () => {
			await popupCustomMenuBarItem(button, menuItem.index);
		});
		button.addEventListener('keydown', async event => {
			if (event.key === 'Enter' || event.key === ' ') {
				event.preventDefault();
				await popupCustomMenuBarItem(button, menuItem.index);
			}
		});
		menuItemsElement.append(button);
	}

	menuBarElement.append(menuItemsElement);
	document.body.append(menuBarElement);
	customMenuBarElement = menuBarElement;

	document.addEventListener('keydown', event => {
		if (event.key === 'Escape' && customMenuBarVisible) {
			setCustomMenuBarVisible(false);
		}
	}, true);

	document.addEventListener('mousedown', event => {
		if (!customMenuBarVisible || menuBarElement.contains(event.target as Node)) {
			return;
		}

		setCustomMenuBarVisible(false);
	}, true);
}

ipc.answerMain('toggle-custom-menu-bar', async () => {
	if (document.documentElement.classList.contains('caprine-media-viewer-open')) {
		return;
	}

	await createCustomMenuBar();
	setCustomMenuBarVisible(!customMenuBarVisible);
});

ipc.answerMain('set-custom-window-controls-media-viewer-open', (open: boolean) => {
	document.documentElement.classList.toggle('caprine-media-viewer-open', open);
	if (open) {
		setCustomMenuBarVisible(false);
	}
});

function createWindowControl(id: string, label: string, title: string, action: string): HTMLButtonElement {
	const button = document.createElement('button');
	button.id = id;
	button.type = 'button';
	button.className = `caprine-window-control ${id === 'caprine-window-close' ? 'caprine-window-control-close' : ''}`;
	button.textContent = label;
	button.title = title;
	button.addEventListener('click', () => {
		void ipc.callMain(action);
	});
	return button;
}

function createWindowControls(): void {
	if (!is.windows) {
		return;
	}

	if (!document.querySelector('#caprine-window-controls')) {
		const controlsElement = document.createElement('div');
		controlsElement.id = 'caprine-window-controls';
		controlsElement.append(
			createWindowControl('caprine-window-minimize', '−', 'Minimize', 'window-control-minimize'),
			createWindowControl('caprine-window-maximize', '□', 'Maximize', 'window-control-toggle-maximize'),
			createWindowControl('caprine-window-close', '×', 'Close', 'window-control-close'),
		);
		document.body.append(controlsElement);
	}
}

ipc.answerMain('show-preferences', async () => {
	if (isPreferencesOpen()) {
		return;
	}

	await openPreferences();
});

ipc.answerMain('new-conversation', async () => {
	document.querySelector<HTMLElement>('a[href="/messages/new/"]')!.click();
});

ipc.answerMain('create-channel', async () => {
	// Click "New message" button to open the dialog
	document.querySelector<HTMLElement>('a[href="/messages/new/"]')!.click();

	// Wait for the "Create channel" element to appear
	const createChannelElement = await elementReady<HTMLElement>('#newBroadcastChannel div', {
		stopOnDomReady: false,
	});

	if (createChannelElement) {
		createChannelElement.click();
	}
});

ipc.answerMain('log-out', async () => {
	const useWorkChat = await ipc.callMain<undefined, boolean>('get-config-useWorkChat');
	if (useWorkChat) {
		document.querySelector<HTMLElement>('._5lxs._3qct._p')!.click();

		// Menu creation is slow
		setTimeout(() => {
			const nodes = document.querySelectorAll<HTMLElement>(
				'._54nq._9jo._558b._2n_z li:last-child a',
			);

			nodes[nodes.length - 1].click();
		}, 250);
	} else {
		const banner = document.querySelector<HTMLElement>('[role="banner"]');

		// Temporarily show the banner so the profile button is interactive
		if (banner) {
			banner.style.setProperty('display', 'block', 'important');
		}

		// Click the profile button (last [aria-expanded] button in banner)
		const profileButtons = [...document.querySelectorAll<HTMLElement>(selectors.userProfileButton)];
		profileButtons[profileButtons.length - 1]?.click();

		// Wait for the profile dropdown to render
		await new Promise(resolve => {
			setTimeout(resolve, 300);
		});

		// Find the logout button inside the profile dialog.
		// The dialog contains: [...items..., Log out, More (aria-haspopup=menu)]
		// Logout is always the button immediately before the "More" expand button.
		const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
		if (dialog) {
			const dialogButtons = [...dialog.querySelectorAll<HTMLElement>('[role="button"]')]
				.filter(b => b.offsetParent !== null);
			const moreIndex = dialogButtons.findIndex(b => b.getAttribute('aria-haspopup') === 'menu');
			if (moreIndex > 0) {
				dialogButtons[moreIndex - 1]?.click();
			} else {
				// Fallback: last button in dialog
				dialogButtons[dialogButtons.length - 1]?.click();
			}
		}

		// Restore banner to hidden state
		if (banner) {
			banner.style.removeProperty('display');
		}
	}
});

ipc.answerMain('find', () => {
	// Scope to the Messenger nav (which contains [role=grid]) to avoid focusing
	// the main Facebook site search bar (index 0 on the page)
	document.querySelector<HTMLElement>('[role="navigation"]:has([role=grid]) input[type="search"]')!.focus();
});

async function openSearchInConversation() {
	const chatInfoButton = document.querySelector<HTMLElement>('[role=button]:has(path[d^="M18,10 C16.6195"])');
	const isPanelExpanded = chatInfoButton?.getAttribute('aria-expanded') === 'true';

	// Expand the right panel if it's collapsed
	if (!isPanelExpanded) {
		document.querySelector<HTMLElement>(selectors.rightSidebarMenu)?.click();
		// Wait for panel to expand and search button to appear
		await new Promise(resolve => {
			setTimeout(resolve, 300);
		});
	}

	// Click the Search button in the right panel (SVG path, language-independent)
	document.querySelector<HTMLElement>('[role=button]:has(path[d^="M7.5 1"])')?.click();
}

ipc.answerMain('search', () => {
	openSearchInConversation();
});

ipc.answerMain('insert-gif', () => {
	document.querySelector<HTMLElement>('[role=button]:has(path[d^="M7.695"])')!.click();
});

ipc.answerMain('insert-emoji', async () => {
	document.querySelector<HTMLElement>('[role=button]:has(path[d^="M210.5,405"])')!.click();
});

ipc.answerMain('insert-sticker', () => {
	document.querySelector<HTMLElement>('[role=button]:has(path[d^="M8.305"])')!.click();
});

ipc.answerMain('attach-files', () => {
	document.querySelector<HTMLElement>('[role=button]:has(path[d^="M7 4.25"])')!.click();
});

ipc.answerMain('focus-text-input', () => {
	document.querySelector<HTMLElement>('[role=textbox][contenteditable=true]')!.focus();
});

ipc.answerMain('next-conversation', nextConversation);

ipc.answerMain('previous-conversation', previousConversation);

ipc.answerMain('mute-conversation', async () => {
	await openMuteModal();
});

ipc.answerMain('delete-conversation', async () => {
	const index = selectedConversationIndex();

	if (index !== -1) {
		await deleteSelectedConversation();

		const key = index + 1;
		await jumpToConversation(key);
	}
});

ipc.answerMain('archive-conversation', async () => {
	const index = selectedConversationIndex();

	if (index !== -1) {
		await archiveSelectedConversation();

		const key = index + 1;
		await jumpToConversation(key);
	}
});

async function openHiddenPreferences(): Promise<boolean> {
	if (!isPreferencesOpen()) {
		document.documentElement.classList.add('hide-preferences-window');

		await openPreferences();

		return true;
	}

	return false;
}

async function toggleSounds({checked}: IToggleSounds): Promise<void> {
	const shouldClosePreferences = await openHiddenPreferences();

	const soundsCheckbox = document.querySelector<HTMLInputElement>(selectors.notificationCheckbox)!;
	if (checked === undefined || checked !== soundsCheckbox.checked) {
		soundsCheckbox.click();
	}

	if (shouldClosePreferences) {
		await closePreferences();
	}
}

ipc.answerMain('toggle-sounds', toggleSounds);

// Get current mute state without opening preferences (for startup sync)
ipc.answerMain('get-mute-notifications-state', async () => {
	const shouldClosePreferences = await openHiddenPreferences();

	const notificationSwitch = document.querySelector<HTMLInputElement>(
		selectors.notificationCheckbox,
	);

	if (notificationSwitch) {
		const isCurrentlyChecked = notificationSwitch.getAttribute('aria-checked') === 'true';
		const isCurrentlyMuted = !isCurrentlyChecked;

		if (shouldClosePreferences) {
			await closePreferences();
		}

		return isCurrentlyMuted;
	}

	if (shouldClosePreferences) {
		await closePreferences();
	}

	return false;
});

ipc.answerMain('toggle-mute-notifications', async ({checked}: IToggleMuteNotifications) => {
	const shouldClosePreferences = await openHiddenPreferences();

	const notificationSwitch = document.querySelector<HTMLInputElement>(
		selectors.notificationCheckbox,
	);

	if (notificationSwitch) {
		// Check current state
		const isCurrentlyChecked = notificationSwitch.getAttribute('aria-checked') === 'true';
		const isCurrentlyMuted = !isCurrentlyChecked;

		// Only toggle if current state doesn't match desired state
		// checked=true means user wants to MUTE (turn switch OFF)
		// checked=false means user wants to UNMUTE (turn switch ON)
		if (isCurrentlyMuted !== checked) {
			notificationSwitch.click();
		}

		if (shouldClosePreferences) {
			await closePreferences();
		}

		// Return the muted state
		return checked;
	}

	if (shouldClosePreferences) {
		await closePreferences();
	}

	// Return false if switch not found
	return false;
});

ipc.answerMain('toggle-message-buttons', async () => {
	const showMessageButtons = await ipc.callMain<undefined, boolean>('get-config-showMessageButtons');
	document.body.classList.toggle('show-message-buttons', !showMessageButtons);
});

async function openSettingsMenuAndClickItem(
	identifier: string | {svgPathPrefix: string},
	options?: {useExactMatch?: boolean; waitForSelector?: string},
): Promise<void> {
	// Click the Settings button
	const settingsButton = document.querySelector<HTMLElement>(selectors.userMenuNewSidebar);
	if (!settingsButton) {
		return;
	}

	settingsButton.click();

	// Wait for the menu to appear
	await elementReady(selectors.conversationMenuSelectorNewDesign, {stopOnDomReady: false});

	// Find and click the menu item by text (English) or SVG icon path (language-independent)
	const menuItems = document.querySelectorAll<HTMLElement>(
		`${selectors.conversationMenuSelectorNewDesign} [role="menuitem"]`,
	);

	for (const item of menuItems) {
		let matches: boolean;
		if (typeof identifier === 'string') {
			const text = item.textContent?.trim();
			matches = options?.useExactMatch ? text === identifier : Boolean(text?.includes(identifier));
		} else {
			matches = Boolean(item.querySelector(`path[d^="${identifier.svgPathPrefix}"]`));
		}

		if (matches) {
			item.click();
			break;
		}
	}

	// Optionally wait for something to appear after clicking
	if (options?.waitForSelector) {
		await elementReady(options.waitForSelector, {stopOnDomReady: false});
	}
}

ipc.answerMain('show-chats-view', async () => {
	await ipc.callMain('navigate-to-chats');
});

ipc.answerMain('show-requests-view', async () => {
	await openSettingsMenuAndClickItem({svgPathPrefix: 'M8 .5'});
});

ipc.answerMain('show-archive-view', async () => {
	await openSettingsMenuAndClickItem({svgPathPrefix: 'M8.75 10'});
});

ipc.answerMain('show-restricted-view', async () => {
	await openSettingsMenuAndClickItem({svgPathPrefix: 'M2.89 16.3'});
});

ipc.answerMain('toggle-video-autoplay', () => {
	toggleVideoAutoplay();
});

ipc.answerMain('reload', () => {
	location.reload();
});

async function setTheme(): Promise<void> {
	const theme = await ipc.callMain<undefined, ThemeSource>('get-config-theme');

	if (nativeTheme.themeSource !== theme) {
		nativeTheme.themeSource = theme;
	}

	setThemeElement(document.documentElement);
	updateVibrancy();
}

function setThemeElement(element: HTMLElement): void {
	const useDarkColors = Boolean(nativeTheme.shouldUseDarkColors);
	element.classList.toggle('dark-mode', useDarkColors);
	element.classList.toggle('light-mode', !useDarkColors);
	element.classList.toggle('__fb-dark-mode', useDarkColors);
	element.classList.toggle('__fb-light-mode', !useDarkColors);
	removeThemeClasses(useDarkColors);
}

function removeThemeClasses(useDarkColors: boolean): void {
	// TODO: Workaround for Facebooks buggy frontend
	// The ui sometimes hardcodes ligth mode classes in the ui. This removes them so the class
	// in the root element would be used.
	const className = useDarkColors ? '__fb-light-mode' : '__fb-dark-mode';
	for (const element of document.querySelectorAll(`.${className}`)) {
		element.classList.remove(className);
	}
}

async function observeTheme(): Promise<void> {
	/* Listen for native theme changes (e.g., OS theme change when themeSource is 'system') */
	nativeTheme.on('updated', setTheme);

	/* Main document's class list */
	const observer = new MutationObserver((records: MutationRecord[]) => {
		// Find records that had class attribute changed
		const classRecords = records.filter(record => record.type === 'attributes' && record.attributeName === 'class');
		// Check if dark mode classes exists
		const isDark = classRecords.some(record => {
			const {classList} = (record.target as HTMLElement);
			return classList.contains('dark-mode') && classList.contains('__fb-dark-mode');
		});
		// If config and class list don't match, update class list
		if (nativeTheme.shouldUseDarkColors !== isDark) {
			setTheme();
		}
	});

	observer.observe(document.documentElement, {attributes: true, attributeFilter: ['class']});

	/* Added nodes (dialogs, etc.) */
	const observerNew = new MutationObserver((records: MutationRecord[]) => {
		const nodeRecords = records.filter(record => record.addedNodes.length > 0);
		for (const nodeRecord of nodeRecords) {
			for (const newNode of nodeRecord.addedNodes) {
				const {classList} = (newNode as HTMLElement);
				const isLight = classList.contains('light-mode') || classList.contains('__fb-light-mode');
				if (nativeTheme.shouldUseDarkColors === isLight) {
					setThemeElement(newNode as HTMLElement);
				}
			}
		}
	});

	/* Observe only elements where new nodes may need dark mode */
	const menuElements = await elementReady('.j83agx80.cbu4d94t.l9j0dhe7.jgljxmt5.be9z9djy > div:nth-of-type(2) > div', {stopOnDomReady: false});
	if (menuElements) {
		observerNew.observe(menuElements, {childList: true});
	}

	const modalElements = await elementReady(selectors.preferencesSelector, {stopOnDomReady: false});
	if (modalElements) {
		observerNew.observe(modalElements, {childList: true});
	}
}

async function setPrivateMode(): Promise<void> {
	const privateMode = await ipc.callMain<undefined, boolean>('get-config-privateMode');
	document.documentElement.classList.toggle('private-mode', privateMode);

	if (is.macos) {
		sendConversationList();
	}
}

async function updateVibrancy(): Promise<void> {
	const {classList} = document.documentElement;

	classList.remove('sidebar-vibrancy', 'full-vibrancy');

	const vibrancy = await ipc.callMain<undefined, 'sidebar' | 'none' | 'full'>('get-config-vibrancy');

	switch (vibrancy) {
		case 'sidebar': {
			classList.add('sidebar-vibrancy');
			break;
		}

		case 'full': {
			classList.add('full-vibrancy');
			break;
		}

		default:
	}

	ipc.callMain('set-vibrancy');
}

async function updateSidebar(): Promise<void> {
	const {classList} = document.documentElement;

	classList.remove('sidebar-hidden', 'sidebar-force-narrow', 'sidebar-force-wide');

	const sidebar = await ipc.callMain<undefined, 'default' | 'hidden' | 'narrow' | 'wide'>('get-config-sidebar');

	switch (sidebar) {
		case 'hidden': {
			classList.add('sidebar-hidden');
			break;
		}

		case 'narrow': {
			classList.add('sidebar-force-narrow');
			break;
		}

		case 'wide': {
			classList.add('sidebar-force-wide');
			break;
		}

		default:
	}
}

async function updateDoNotDisturb(): Promise<void> {
	/* TODO: Implement this function
	const shouldClosePreferences = await openHiddenPreferences();

	if (shouldClosePreferences) {
		await closePreferences();
	}
	*/
}

function renderOverlayIcon(messageCount: number): HTMLCanvasElement {
	const canvas = document.createElement('canvas');
	canvas.height = 128;
	canvas.width = 128;
	canvas.style.letterSpacing = '-5px';

	const context = canvas.getContext('2d')!;
	context.fillStyle = '#f42020';
	context.beginPath();
	context.ellipse(64, 64, 64, 64, 0, 0, 2 * Math.PI);
	context.fill();
	context.textAlign = 'center';
	context.fillStyle = 'white';
	context.font = '90px sans-serif';
	context.fillText(String(Math.min(99, messageCount)), 64, 96);

	return canvas;
}

async function imageFromDataUrl(dataUrl: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const image = new Image();
		image.addEventListener('load', () => {
			resolve(image);
		}, {once: true});
		image.addEventListener('error', () => {
			reject(new Error('Could not load tray icon image.'));
		}, {once: true});
		image.src = dataUrl;
	});
}

function drawTrayUnreadBadge(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, messageCount: number): void {
	const countText = String(Math.min(99, messageCount));
	const badgeRadius = canvas.width * 0.28;
	const centerX = canvas.width - badgeRadius;
	const centerY = badgeRadius;

	context.save();
	context.fillStyle = '#f42020';
	context.beginPath();
	context.arc(centerX, centerY, badgeRadius, 0, Math.PI * 2);
	context.fill();

	context.lineWidth = Math.max(1, canvas.width * 0.045);
	context.strokeStyle = 'white';
	context.stroke();

	context.fillStyle = 'white';
	context.textAlign = 'center';
	context.textBaseline = 'middle';
	context.font = `bold ${canvas.width * (countText.length > 1 ? 0.3 : 0.38)}px sans-serif`;
	context.fillText(countText, centerX, centerY + (canvas.width * 0.015));
	context.restore();
}

async function renderTrayIconCanvas({messageCount, isOnline}: TrayIconState): Promise<HTMLCanvasElement> {
	const iconName = isOnline ? 'IconTray.png' : 'IconTrayOffline.png';
	const sourceImage = await imageFromDataUrl(loadStaticImageDataUrl(iconName));
	const canvas = document.createElement('canvas');
	canvas.width = sourceImage.width;
	canvas.height = sourceImage.height;

	const context = canvas.getContext('2d')!;
	context.drawImage(sourceImage, 0, 0);

	if (isOnline && messageCount > 0) {
		drawTrayUnreadBadge(context, canvas, messageCount);
	}

	return canvas;
}

async function renderTrayIcon(state: TrayIconState): Promise<RenderedTrayIcon> {
	const canvas = await renderTrayIconCanvas(state);
	const text = state.isOnline
		? `${state.messageCount} unread ${state.messageCount === 1 ? 'message' : 'messages'}`
		: 'Offline';

	return {
		data: canvas.toDataURL(),
		text,
	};
}

ipc.answerMain('update-sidebar', () => {
	updateSidebar();
});

ipc.answerMain('set-theme', setTheme);

ipc.answerMain('set-private-mode', setPrivateMode);

ipc.answerMain('update-vibrancy', () => {
	updateVibrancy();
});

ipc.answerMain('render-overlay-icon', (messageCount: number): {data: string; text: string} => ({
	data: renderOverlayIcon(messageCount).toDataURL(),
	text: String(messageCount),
}));

ipc.answerMain('render-tray-icon', renderTrayIcon);

ipc.answerMain('render-native-emoji', (emoji: string): string => {
	const canvas = document.createElement('canvas');
	const context = canvas.getContext('2d')!;
	const systemFont = is.linux ? 'emoji, system-ui' : 'system-ui';
	canvas.width = 256;
	canvas.height = 256;
	context.textAlign = 'center';
	context.textBaseline = 'middle';
	if (is.macos) {
		context.font = `256px ${systemFont}`;
		context.fillText(emoji, 128, 154);
	} else {
		context.textBaseline = 'bottom';
		context.font = `225px ${systemFont}`;
		context.fillText(emoji, 128, 256);
	}

	const dataUrl = canvas.toDataURL();
	return dataUrl;
});

ipc.answerMain('zoom-reset', async () => {
	await setZoom(1);
});

ipc.answerMain('zoom-in', async () => {
	let zoomFactor = await ipc.callMain<undefined, number>('get-config-zoomFactor');
	zoomFactor += 0.1;

	if (zoomFactor < 1.6) {
		await setZoom(zoomFactor);
	}
});

ipc.answerMain('zoom-out', async () => {
	let zoomFactor = await ipc.callMain<undefined, number>('get-config-zoomFactor');
	zoomFactor -= 0.1;

	if (zoomFactor >= 0.8) {
		await setZoom(zoomFactor);
	}
});

ipc.answerMain('jump-to-conversation', async (key: number) => {
	await jumpToConversation(key);
});

async function nextConversation(): Promise<void> {
	const index = selectedConversationIndex(1);

	if (index !== -1) {
		await selectConversation(index, 1);
	}
}

async function previousConversation(): Promise<void> {
	const index = selectedConversationIndex(-1);

	if (index !== -1) {
		await selectConversation(index, -1);
	}
}

async function jumpToConversation(key: number): Promise<void> {
	const index = key - 1;
	await selectConversation(index);
}

// Focus on the conversation with the given index
async function selectConversation(index: number, direction = 0): Promise<void> {
	await elementReady(selectors.conversationList, {stopOnDomReady: false});

	const rows = document.querySelectorAll<HTMLElement>(`${selectors.conversationList} [role="row"]`);
	const totalRows = rows.length;

	if (totalRows === 0) {
		return;
	}

	let currentIndex = ((index % totalRows) + totalRows) % totalRows;

	for (let attempt = 0; attempt < totalRows; attempt++) {
		const conversation = rows[currentIndex];

		if (conversation) {
			const link = conversation.querySelector<HTMLElement>('[role="link"]');
			if (link) {
				link.click();
				return;
			}
		}

		// Skip non-link rows (e.g. ads, "show more") by advancing in the direction
		if (direction === 0) {
			break;
		}

		const wrappedIndex = (currentIndex + direction) % totalRows;
		currentIndex = (wrappedIndex + totalRows) % totalRows;
	}
}

function selectedConversationIndex(offset = 0): number {
	const selected = document.querySelector<HTMLElement>(selectors.selectedConversation);

	if (!selected) {
		return -1;
	}

	const rows = document.querySelectorAll<HTMLElement>(`${selectors.conversationList} [role="row"]`);
	const list = [...rows];
	const newSelected = selected.closest<HTMLElement>('[role="row"]')!;
	const index = list.indexOf(newSelected) + offset;

	return ((index % list.length) + list.length) % list.length;
}

async function setZoom(zoomFactor: number): Promise<void> {
	webFrame.setZoomFactor(zoomFactor);

	const node = document.querySelector<HTMLElement>('#zoomFactor')!;
	node.textContent = '';
	await ipc.callMain<number, void>('set-config-zoomFactor', zoomFactor);
}

/** Finds a menu item in [role=menu] by its icon SVG path prefix (language-independent). */
function findMenuItemByIconPath(svgPathPrefix: string): HTMLElement | undefined {
	const items = document.querySelectorAll<HTMLElement>(
		`${selectors.conversationMenuSelectorNewDesign} [role=menuitem]`,
	);
	for (const item of items) {
		if (item.querySelector(`path[d^="${svgPathPrefix}"]`)) {
			return item;
		}
	}

	return undefined;
}

/** Returns all [role=menuitem] elements in the currently open conversation menu. */
function getConversationMenuItems(): HTMLElement[] {
	return [...document.querySelectorAll<HTMLElement>(
		`${selectors.conversationMenuSelectorNewDesign} [role=menuitem]`,
	)];
}

/** Finds the Mute menu item: SVG path first, positional fallback (always index 1). */
function findMuteMenuItem(): HTMLElement | undefined {
	return findMenuItemByIconPath('M109.362 211') ?? getConversationMenuItems()[1] ?? undefined;
}

/** Finds the Delete menu item: SVG path first, fallback via Report item anchor. */
function findDeleteMenuItem(): HTMLElement | undefined {
	const byPath = findMenuItemByIconPath('M8.75');
	if (byPath) {
		return byPath;
	}

	// Fallback: Delete is always right before Report (warning-triangle icon)
	const reportItem = findMenuItemByIconPath('M112.423 209.728');
	return (reportItem?.previousElementSibling as HTMLElement | undefined) ?? undefined;
}

async function withConversationMenu(callback: () => void): Promise<void> {
	// eslint-disable-next-line @typescript-eslint/ban-types
	let menuButton: HTMLElement | null = null;
	const conversation = document.querySelector<HTMLElement>(selectors.selectedConversation)!.closest('[role=row]');

	// Find the menu button: the [role=button] whose parent has 'html-div' class (language-independent)
	// The conversation row may have multiple [role=button] elements (e.g., "View profile" + "More options")
	const buttons = conversation?.querySelectorAll<HTMLElement>('[role=button]');
	menuButton = [...(buttons ?? [])].find(button => button.parentElement?.classList.contains('html-div')) ?? null;

	if (menuButton) {
		await withMenu(menuButton, callback);
	}
}

async function openMuteModal(): Promise<void> {
	await withConversationMenu(() => {
		findMuteMenuItem()?.click();
	});
}

/*
These functions assume:
- There is a selected conversation.
- That the conversation already has its conversation menu open.

In other words, you should only use this function within a callback that is provided to `withConversationMenu()`, because `withConversationMenu()` makes sure to have the conversation menu open before executing the callback and closes the conversation menu afterwards.
*/

async function archiveSelectedConversation(): Promise<void> {
	await withConversationMenu(() => {
		// Archive has no unique SVG icon; find it as the sibling immediately before Delete
		const archiveItem = findDeleteMenuItem()?.previousElementSibling as HTMLElement | undefined;
		archiveItem?.click();
	});
}

async function deleteSelectedConversation(): Promise<void> {
	await withConversationMenu(() => {
		findDeleteMenuItem()?.click();
	});
}

async function openPreferences(): Promise<void> {
	await openSettingsMenuAndClickItem(
		{svgPathPrefix: 'M10 5.75'},
		{waitForSelector: selectors.preferencesSelector},
	);
}

function isPreferencesOpen(): boolean {
	return Boolean(document.querySelector<HTMLElement>(selectors.preferencesSelector));
}

async function closePreferences(): Promise<void> {
	// Wait for the preferences window to be closed, then remove the class from the document
	const preferencesOverlayObserver = new MutationObserver(records => {
		const removedRecords = records.filter(({removedNodes}) => removedNodes.length > 0 && (removedNodes[0] as HTMLElement).tagName === 'DIV');

		// In case there is a div removed, hide utility class and stop observing
		if (removedRecords.length > 0) {
			document.documentElement.classList.remove('hide-preferences-window');
			preferencesOverlayObserver.disconnect();
		}
	});

	const preferencesOverlay = document.querySelector(selectors.preferencesSelector)!;

	// Get the parent of preferences, that's not getting deleted
	const preferencesParent = preferencesOverlay.closest('div:not([class])')!;

	preferencesOverlayObserver.observe(preferencesParent, {childList: true});

	const closeButton = preferencesOverlay.querySelector(selectors.closePreferencesButton)!;
	(closeButton as HTMLElement)?.click();
}

function insertionListener(event: AnimationEvent): void {
	if (event.animationName === 'nodeInserted' && event.target) {
		event.target.dispatchEvent(new Event('mouseover', {bubbles: true}));
	}
}

async function observeAutoscroll(): Promise<void> {
	const mainElement = await elementReady('._4sp8', {stopOnDomReady: false});
	if (!mainElement) {
		return;
	}

	const scrollToBottom = (): void => {
		// eslint-disable-next-line @typescript-eslint/ban-types
		const scrollableElement: HTMLElement | null = document.querySelector('[role=presentation] .scrollable');
		if (scrollableElement) {
			scrollableElement.scroll({
				top: Number.MAX_SAFE_INTEGER,
				behavior: 'smooth',
			});
		}
	};

	const hookMessageObserver = async (): Promise<void> => {
		const chatElement = await elementReady(
			'[role=presentation] .scrollable [role = region] > div[id ^= "js_"]', {stopOnDomReady: false},
		);

		if (chatElement) {
			// Scroll to the bottom when opening different conversation
			scrollToBottom();

			const messageObserver = new MutationObserver((record: MutationRecord[]) => {
				const newMessages: MutationRecord[] = record.filter(record =>
					// The mutation is an addition
					record.addedNodes.length > 0
						// ... of a div       (skip the "seen" status change)
						&& (record.addedNodes[0] as HTMLElement).tagName === 'DIV'
						// ... on the last child       (skip previous messages added when scrolling up)
						&& chatElement.lastChild!.contains(record.target),
				);

				if (newMessages.length > 0) {
					// Scroll to the bottom when there are new messages
					scrollToBottom();
				}
			});

			messageObserver.observe(chatElement, {childList: true, subtree: true});
		}
	};

	hookMessageObserver();

	// Hook it again if conversation changes
	const conversationObserver = new MutationObserver(hookMessageObserver);
	conversationObserver.observe(mainElement, {childList: true});
}

async function observeThemeBugs(): Promise<void> {
	const rootObserver = new MutationObserver((record: MutationRecord[]) => {
		const newNodes: MutationRecord[] = record
			.filter(record => record.addedNodes.length > 0 || record.removedNodes.length > 0);

		if (newNodes) {
			removeThemeClasses(Boolean(nativeTheme.shouldUseDarkColors));
		}
	});

	rootObserver.observe(document.documentElement, {childList: true, subtree: true});
}

// Listen for emoji element dom insertion
document.addEventListener('animationstart', insertionListener, false);

// Inject a CSS class on the messenger layout container to enable proper styling
function injectMessengerLayoutClass(): void {
	const threadListNavigation = document.querySelector('[role="navigation"]:has([role="grid"])');
	threadListNavigation?.parentElement?.classList.add('caprine-thread-list-container');
}

function isFacebookTopChrome(element: Element): element is HTMLElement {
	if (!(element instanceof HTMLElement)) {
		return false;
	}

	if (element.id === 'caprine-custom-menu-bar' || element.closest('#caprine-custom-menu-bar')) {
		return false;
	}

	if (element.matches('[role="navigation"]:has([role="grid"])') || element.closest('[role="navigation"]:has([role="grid"])')) {
		return false;
	}

	const {top, width, height} = element.getBoundingClientRect();
	if (top > 8 || width < window.innerWidth * 0.75 || height < 36 || height > 96) {
		return false;
	}

	const labels = [...element.querySelectorAll<HTMLElement>('[aria-label], a[href]')]
		.map(node => `${node.getAttribute('aria-label') ?? ''} ${node.getAttribute('href') ?? ''}`)
		.join(' ')
		.toLowerCase();

	const facebookNavigationSignals = [
		'facebook',
		'home',
		'watch',
		'marketplace',
		'groups',
		'gaming',
		'notifications',
		'/friends',
		'/watch',
		'/marketplace',
		'/groups',
		'/gaming',
	];

	return facebookNavigationSignals.filter(signal => labels.includes(signal)).length >= 3;
}

function hideFacebookTopChrome(): void {
	document.documentElement.style.setProperty('--header-height', '0px', 'important');
	document.documentElement.style.setProperty('--messenger-card-spacing', '0px', 'important');

	const candidates = [
		...document.querySelectorAll('[role="banner"], [data-pagelet="CometRoot"] > div:first-child, body > div, body > [role="navigation"]'),
	];

	for (const candidate of candidates) {
		if (!isFacebookTopChrome(candidate)) {
			continue;
		}

		candidate.style.setProperty('display', 'none', 'important');
		candidate.style.setProperty('height', '0', 'important');
		candidate.style.setProperty('min-height', '0', 'important');
		candidate.style.setProperty('pointer-events', 'none', 'important');
		candidate.setAttribute('aria-hidden', 'true');
	}
}

function observeFacebookTopChrome(): void {
	hideFacebookTopChrome();

	let queued = false;
	const observer = new MutationObserver(() => {
		if (queued) {
			return;
		}

		queued = true;
		requestAnimationFrame(() => {
			queued = false;
			hideFacebookTopChrome();
		});
	});

	observer.observe(document.documentElement, {
		childList: true,
		subtree: true,
		attributes: true,
		attributeFilter: ['aria-label', 'class', 'data-pagelet', 'href', 'role', 'style'],
	});
}

// Observe for navigation changes and re-inject the class when needed
function observeMessengerLayout(): void {
	const observer = new MutationObserver(() => {
		// Check if the class is missing but the navigation exists
		const threadListNavigation = document.querySelector('[role="navigation"]:has([role="grid"])');
		if (threadListNavigation?.parentElement && !threadListNavigation.parentElement.classList.contains('caprine-thread-list-container')) {
			threadListNavigation.parentElement.classList.add('caprine-thread-list-container');
		}

		injectSidebarBrand();
		maybeDismissStartupSplash();
	});

	observer.observe(document.body, {childList: true, subtree: true});
}

function injectSidebarBrand(): void {
	const navigation = document.querySelector('[role="navigation"]:has([role="grid"])');
	if (!navigation) {
		return;
	}

	const heading = [...navigation.querySelectorAll<HTMLElement>('h1, h2, h3')]
		.find(element => element.textContent?.trim() === 'Chats');

	if (!heading || heading.querySelector('.caprine-sidebar-brand-icon')) {
		return;
	}

	const textWalker = document.createTreeWalker(heading, NodeFilter.SHOW_TEXT);
	let textNode = textWalker.nextNode();
	while (textNode) {
		if (textNode.textContent?.trim() === 'Chats') {
			textNode.textContent = textNode.textContent.replace('Chats', 'Caprine');
			break;
		}

		textNode = textWalker.nextNode();
	}

	heading.classList.add('caprine-sidebar-brand');

	const image = document.createElement('img');
	image.className = 'caprine-sidebar-brand-icon';
	image.src = loadStaticImageDataUrl('IconAppBlue.png');
	image.alt = '';
	image.draggable = false;
	image.style.position = 'absolute';
	image.style.top = 'calc(50% + 2px)';
	image.style.left = '6px';
	image.style.width = '26px';
	image.style.height = '26px';
	image.style.maxWidth = '26px';
	image.style.maxHeight = '26px';
	image.style.borderRadius = '6px';
	image.style.objectFit = 'cover';
	image.style.transform = 'translateY(-50%)';

	heading.prepend(image);
}

// Inject a global style node to maintain custom appearance after conversation change or startup
document.addEventListener('DOMContentLoaded', async () => {
	createWindowControls();

	const style = document.createElement('style');
	style.id = 'zoomFactor';
	document.body.append(style);

	// Inject messenger layout class for proper padding and spacing
	injectMessengerLayoutClass();
	injectSidebarBrand();
	hideFacebookTopChrome();
	observeMessengerLayout();
	observeFacebookTopChrome();

	// Set the zoom factor if it was set before quitting
	const zoomFactor = await ipc.callMain<undefined, number>('get-config-zoomFactor');
	setZoom(zoomFactor);

	// Enable OS specific styles
	document.documentElement.classList.add(`os-${process.platform}`);

	// Restore sidebar view state to what is was set before quitting
	updateSidebar();

	// Activate Dark Mode if it was set before quitting
	setTheme();
	// Observe for dark mode changes
	observeTheme();

	// Activate Private Mode if it was set before quitting
	setPrivateMode();

	// Configure do not disturb
	if (is.macos) {
		await updateDoNotDisturb();
	}

	// Disable autoplay if set in settings
	toggleVideoAutoplay();

	// Hook auto-scroll observer
	observeAutoscroll();

	// Hook broken dark mode observer
	observeThemeBugs();

	// Inject a transparent drag bar at the top of the frameless window.
	// This is needed because Facebook's JS event handlers on child elements
	// prevent -webkit-app-region: drag from working when the window is focused.
	// The drag bar sits above all web content and handles window dragging.
	// On mousemove, we toggle pointer-events to allow clicking interactive
	// elements (buttons, links) underneath while keeping empty space draggable.
	if (is.macos || is.windows) {
		const dragBarHeight = 24;
		const dragBar = document.createElement('div');
		dragBar.id = 'caprine-drag-bar';
		dragBar.style.position = 'fixed';
		dragBar.style.top = '0';
		dragBar.style.left = '0';
		dragBar.style.right = is.windows ? '108px' : '0';
		dragBar.style.height = `${dragBarHeight}px`;
		dragBar.style.zIndex = '99999';
		dragBar.style.background = 'transparent';
		dragBar.style.border = '0';
		dragBar.style.boxShadow = 'none';
		dragBar.style.setProperty('-webkit-app-region', 'drag');
		document.body.append(dragBar);

		const interactiveSelector = 'button, a[href], input, select, textarea, [role="button"], [role="link"], [role="search"], [contenteditable="true"]';

		// Debounce mousemove to reduce CPU usage - only process every 100ms
		let debounceTimer: ReturnType<typeof setTimeout> | undefined;
		let lastMouseX = 0;
		let lastMouseY = 0;
		document.addEventListener('mousemove', (event: MouseEvent) => {
			lastMouseX = event.clientX;
			lastMouseY = event.clientY;

			if (debounceTimer) {
				return;
			}

			debounceTimer = setTimeout(() => {
				debounceTimer = undefined;

				if (lastMouseY >= dragBarHeight) {
					dragBar.style.pointerEvents = '';
					return;
				}

				// Temporarily hide drag bar to find what's underneath
				dragBar.style.pointerEvents = 'none';
				const target = document.elementFromPoint(lastMouseX, lastMouseY);

				if (target?.closest(interactiveSelector)) {
					// Over an interactive element - keep drag bar transparent for clicks
					return;
				}

				// Over empty space - re-enable drag bar for window dragging
				dragBar.style.pointerEvents = '';
			}, 100);
		}, {passive: true});
	}
});

// Handle title bar double-click.
window.addEventListener('dblclick', (event: Event) => {
	const target = event.target as HTMLElement;
	const titleBar = target.closest('._36ic._5l-3,._5742,._6-xk,._673w');

	if (!titleBar) {
		return;
	}

	ipc.callMain('titlebar-doubleclick');
}, {
	passive: true,
});

function filenameFromMimeType(mimeType: string): string {
	const extension: Record<string, string> = {
		'application/pdf': 'file.pdf',
		'image/jpeg': 'image.jpg',
		'image/png': 'image.png',
		'image/gif': 'image.gif',
		'video/mp4': 'video.mp4',
		'audio/mpeg': 'audio.mp3',
		'application/zip': 'archive.zip',
	};
	const base = mimeType.split(';')[0]?.trim() ?? '';
	return extension[base] ?? 'download';
}

function handleLinkClick(event: MouseEvent, target: HTMLElement): boolean {
	const link = target.closest<HTMLAnchorElement>('a[href]');
	if (!link) {
		return false;
	}

	const href = link.getAttribute('href');
	if (!href) {
		return false;
	}

	if (href.startsWith('#')) {
		return false;
	}

	if (href.toLowerCase().startsWith('javascript')) {
		return false;
	}

	const fullUrl = href.startsWith('http') ? href : new URL(href, window.location.href).href;
	const url = new URL(fullUrl);

	if (isInternalUrl(url)) {
		return false;
	}

	if (href.startsWith('blob:')) {
		event.preventDefault();
		event.stopPropagation();
		event.stopImmediatePropagation();

		void (async () => {
			try {
				const response = await fetch(href);
				const arrayBuffer = await response.arrayBuffer();
				const contentType = response.headers.get('content-type') ?? 'application/octet-stream';
				const filename
					= link.getAttribute('download')
					?? link.textContent?.trim()
					?? filenameFromMimeType(contentType);
				await ipc.callMain('save-blob-file', {data: arrayBuffer, filename});
			} catch {}
		})();

		return true;
	}

	event.preventDefault();
	event.stopPropagation();
	event.stopImmediatePropagation();

	ipc.callMain('open-external', fullUrl);

	return true;
}

function isInternalUrl(url: URL): boolean {
	const isFacebookDomain = url.hostname.endsWith('.facebook.com') || url.hostname === 'www.facebook.com' || url.hostname === 'web.facebook.com';

	if (!isFacebookDomain) {
		return false;
	}

	if (url.pathname.startsWith('/messages')) {
		return true;
	}

	if (url.pathname.startsWith('/login')) {
		return true;
	}

	if (url.pathname.startsWith('/checkpoint')) {
		return true;
	}

	if (url.pathname.startsWith('/two_step_verification')) {
		return true;
	}

	if (url.pathname.startsWith('/two_factor')) {
		return true;
	}

	if (url.pathname === '/' || url.pathname === '') {
		return true;
	}

	return false;
}

document.addEventListener('click', (event: MouseEvent) => {
	const target = event.target as HTMLElement;

	const currentUrl = new URL(window.location.href);
	const isFacebookDomain = currentUrl.hostname.endsWith('.facebook.com') || currentUrl.hostname === 'www.facebook.com' || currentUrl.hostname === 'web.facebook.com';
	const isMessagesPage = isFacebookDomain && currentUrl.pathname.startsWith('/messages');
	const isLoginPage = isFacebookDomain && (
		currentUrl.pathname.startsWith('/login')
		|| currentUrl.pathname.startsWith('/checkpoint')
		|| currentUrl.pathname.startsWith('/two_step_verification')
		|| currentUrl.pathname.startsWith('/two_factor')
		|| currentUrl.pathname === '/'
	);

	if (!isMessagesPage && !isLoginPage) {
		return;
	}

	if (target.tagName === 'IMG') {
		return;
	}

	handleLinkClick(event, target);
}, {
	capture: true,
});

function hideSkipLinks(): void {
	for (const element of document.querySelectorAll<HTMLElement>('a, button, [role="link"], [role="button"]')) {
		const text = element.textContent?.trim().replaceAll(/\s+/g, ' ').toLowerCase();

		if (!text?.startsWith('skip to ')) {
			continue;
		}

		element.classList.add('caprine-hidden-skip-link');
		element.tabIndex = -1;
		element.setAttribute('aria-hidden', 'true');
	}
}

function setupSkipLinkHider(): void {
	hideSkipLinks();

	const observer = new MutationObserver(hideSkipLinks);
	observer.observe(document.body, {
		childList: true,
		subtree: true,
	});
}

const mediaViewerZoomLevels = new WeakMap<HTMLImageElement | HTMLVideoElement, number>();
const mediaViewerPanOffsets = new WeakMap<HTMLImageElement | HTMLVideoElement, {x: number; y: number}>();
const zoomedMediaViewerElements = new Set<HTMLImageElement | HTMLVideoElement>();
type MediaViewerPan = {
	media: HTMLImageElement | HTMLVideoElement;
	startX: number;
	startY: number;
	initialX: number;
	initialY: number;
};
let mediaViewerPan: MediaViewerPan | undefined;
let currentMediaViewerSignature: string | undefined;

type VisibleMediaElement = {
	element: HTMLImageElement | HTMLVideoElement;
	bounds: DOMRect;
	area: number;
};

function visibleMediaElements(): VisibleMediaElement[] {
	return [...document.querySelectorAll<HTMLImageElement | HTMLVideoElement>('img, video')]
		.map(element => ({
			element,
			bounds: element.getBoundingClientRect(),
		}))
		.map(({element, bounds}) => ({
			element,
			bounds,
			area: bounds.width * bounds.height,
		}))
		.filter(({bounds, area}) =>
			area > 40_000
			&& bounds.bottom > 0
			&& bounds.right > 0
			&& bounds.top < window.innerHeight
			&& bounds.left < window.innerWidth,
		);
}

function mediaContainsPoint({bounds}: VisibleMediaElement, x: number, y: number): boolean {
	return x >= bounds.left
		&& x <= bounds.right
		&& y >= bounds.top
		&& y <= bounds.bottom;
}

function isLikelyMediaViewerBackdrop({element, area}: VisibleMediaElement): boolean {
	const viewportArea = window.innerWidth * window.innerHeight;
	const style = window.getComputedStyle(element);
	const parentStyle = element.parentElement ? window.getComputedStyle(element.parentElement) : undefined;
	const hasBlur = style.filter.includes('blur') || (parentStyle?.filter.includes('blur') ?? false);
	const fillsViewport = area > viewportArea * 0.9;
	const isCoverImage = style.objectFit === 'cover' || parentStyle?.objectFit === 'cover';

	return hasBlur || (fillsViewport && isCoverImage);
}

function mediaViewerCandidates(): VisibleMediaElement[] {
	return visibleMediaElements()
		.filter(candidate => !isLikelyMediaViewerBackdrop(candidate))
		.sort((a, b) => b.area - a.area);
}

function mainMediaViewerElement(): HTMLImageElement | HTMLVideoElement | undefined {
	return mediaViewerCandidates()[0]?.element;
}

function mediaViewerSignature(media: HTMLImageElement | HTMLVideoElement | undefined): string | undefined {
	if (!media) {
		return;
	}

	if (media instanceof HTMLImageElement) {
		return media.currentSrc || media.src;
	}

	return media.currentSrc || media.src || media.poster;
}

function hasMediaViewerDialog(): boolean {
	const largest = mediaViewerCandidates()[0];
	if (!largest) {
		return false;
	}

	const viewportArea = window.innerWidth * window.innerHeight;
	const largeEnoughForViewer = largest.area > Math.min(250_000, viewportArea * 0.1);
	if (!largeEnoughForViewer) {
		return false;
	}

	const modalAncestor = largest.element.closest('[role="dialog"], [aria-modal="true"]');
	if (modalAncestor) {
		return true;
	}

	const centerX = window.innerWidth / 2;
	const centerY = window.innerHeight / 2;
	return centerX >= largest.bounds.left
		&& centerX <= largest.bounds.right
		&& centerY >= largest.bounds.top
		&& centerY <= largest.bounds.bottom;
}

function mediaViewerElementAt(event: MouseEvent | WheelEvent): HTMLImageElement | HTMLVideoElement | undefined {
	const {target} = event;
	if (!(target instanceof Element)) {
		return;
	}

	if (!hasMediaViewerDialog()) {
		return;
	}

	const mainMedia = mediaViewerCandidates()[0];
	if (!mainMedia || !mediaContainsPoint(mainMedia, event.clientX, event.clientY)) {
		return;
	}

	return mainMedia.element;
}

function applyMediaViewerTransform(media: HTMLImageElement | HTMLVideoElement, animate = false): void {
	const scale = mediaViewerZoomLevels.get(media) ?? 1;
	const pan = mediaViewerPanOffsets.get(media) ?? {x: 0, y: 0};

	if (scale === 1) {
		media.style.removeProperty('cursor');
		media.style.removeProperty('transform');
		media.style.removeProperty('transform-origin');
		media.style.removeProperty('transition');
		mediaViewerPanOffsets.delete(media);
		zoomedMediaViewerElements.delete(media);
		return;
	}

	media.style.setProperty('cursor', mediaViewerPan?.media === media ? 'grabbing' : 'grab', 'important');
	media.style.setProperty('transform', `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${scale})`, 'important');
	media.style.setProperty('transform-origin', 'center center', 'important');
	media.style.setProperty('transition', animate ? 'transform 120ms ease' : 'none', 'important');
}

function setMediaViewerZoom(media: HTMLImageElement | HTMLVideoElement, scale: number, animate = false): void {
	const nextScale = Math.min(4, Math.max(1, scale));
	mediaViewerZoomLevels.set(media, nextScale);
	zoomedMediaViewerElements.add(media);
	applyMediaViewerTransform(media, animate);
}

function resetMediaViewerZoom(): void {
	for (const media of zoomedMediaViewerElements) {
		media.style.removeProperty('cursor');
		media.style.removeProperty('transform');
		media.style.removeProperty('transform-origin');
		media.style.removeProperty('transition');
		mediaViewerPanOffsets.delete(media);
	}

	zoomedMediaViewerElements.clear();
	mediaViewerPan = undefined;
}

function resetZoomWhenMediaChanges(): void {
	const signature = mediaViewerSignature(mainMediaViewerElement());
	if (signature === currentMediaViewerSignature) {
		return;
	}

	currentMediaViewerSignature = signature;
	resetMediaViewerZoom();
}

function setupMediaViewerZoom(): void {
	document.addEventListener('dblclick', event => {
		const media = mediaViewerElementAt(event);
		if (!media) {
			return;
		}

		event.preventDefault();
		event.stopPropagation();

		const currentScale = mediaViewerZoomLevels.get(media) ?? 1;
		setMediaViewerZoom(media, currentScale === 1 ? 2 : 1, true);
	}, {capture: true});

	document.addEventListener('wheel', event => {
		const media = mediaViewerElementAt(event);
		if (!media) {
			return;
		}

		event.preventDefault();
		event.stopPropagation();

		const currentScale = mediaViewerZoomLevels.get(media) ?? 1;
		const direction = event.deltaY < 0 ? 1 : -1;
		setMediaViewerZoom(media, currentScale + (direction * 0.25));
	}, {capture: true, passive: false});

	document.addEventListener('mousedown', event => {
		const media = mediaViewerElementAt(event);
		if (!media || (mediaViewerZoomLevels.get(media) ?? 1) === 1) {
			return;
		}

		event.preventDefault();
		event.stopPropagation();

		const pan = mediaViewerPanOffsets.get(media) ?? {x: 0, y: 0};
		mediaViewerPan = {
			media,
			startX: event.clientX,
			startY: event.clientY,
			initialX: pan.x,
			initialY: pan.y,
		};
		applyMediaViewerTransform(media);
	}, {capture: true});

	document.addEventListener('mousemove', event => {
		if (!mediaViewerPan) {
			return;
		}

		event.preventDefault();
		event.stopPropagation();

		const nextPan = {
			x: mediaViewerPan.initialX + event.clientX - mediaViewerPan.startX,
			y: mediaViewerPan.initialY + event.clientY - mediaViewerPan.startY,
		};
		mediaViewerPanOffsets.set(mediaViewerPan.media, nextPan);
		applyMediaViewerTransform(mediaViewerPan.media);
	}, {capture: true});

	document.addEventListener('mouseup', event => {
		if (!mediaViewerPan) {
			return;
		}

		event.preventDefault();
		event.stopPropagation();

		const {media} = mediaViewerPan;
		mediaViewerPan = undefined;
		applyMediaViewerTransform(media);
	}, {capture: true});

	window.addEventListener('blur', () => {
		if (!mediaViewerPan) {
			return;
		}

		const {media} = mediaViewerPan;
		mediaViewerPan = undefined;
		applyMediaViewerTransform(media);
	});
}

function setupMediaViewerWindowControls(): void {
	let mediaViewerOpen = false;

	const update = (): void => {
		const open = hasMediaViewerDialog();
		if (open === mediaViewerOpen) {
			if (open) {
				resetZoomWhenMediaChanges();
			}

			return;
		}

		mediaViewerOpen = open;
		document.documentElement.classList.toggle('caprine-media-viewer-open', mediaViewerOpen);
		ipc.callMain('set-media-viewer-open', mediaViewerOpen);

		if (mediaViewerOpen) {
			resetZoomWhenMediaChanges();
		} else {
			currentMediaViewerSignature = undefined;
			resetMediaViewerZoom();
		}
	};

	update();

	const observer = new MutationObserver(update);
	observer.observe(document.body, {
		childList: true,
		subtree: true,
		attributes: true,
		attributeFilter: ['aria-label', 'role', 'src', 'style', 'class'],
	});
}

window.addEventListener('load', async () => {
	createWindowControls();
	ensureStartupSplash();
	setupSkipLinkHider();
	setupMediaViewerWindowControls();
	setupMediaViewerZoom();

	if (location.pathname.startsWith('/login')) {
		const keepMeSignedInCheckbox = document.querySelector<HTMLInputElement>('[id^="u_0_0"]')!;
		const keepMeSignedInConfig = await ipc.callMain<undefined, boolean>('get-config-keepMeSignedIn');
		keepMeSignedInCheckbox.checked = keepMeSignedInConfig;
		keepMeSignedInCheckbox.addEventListener('change', async () => {
			const keepMeSignedIn = await ipc.callMain<undefined, boolean>('get-config-keepMeSignedIn');
			await ipc.callMain('set-config-keepMeSignedIn', keepMeSignedIn);
		});
	}
});

// Toggles styles for inactive window
window.addEventListener('blur', () => {
	document.documentElement.classList.add('is-window-inactive');
});
window.addEventListener('focus', () => {
	document.documentElement.classList.remove('is-window-inactive');
});

// It's not possible to add multiple accelerators
// so this needs to be done the old-school way
document.addEventListener('keydown', async event => {
	// The `!event.altKey` part is a workaround for https://github.com/electron/electron/issues/13895
	const combineKey = is.macos ? event.metaKey : event.ctrlKey && !event.altKey;

	if (!combineKey) {
		return;
	}

	if (event.key === 'Tab') {
		event.preventDefault();
		await (event.shiftKey ? previousConversation() : nextConversation());

		return;
	}

	if (event.key === ']') {
		event.preventDefault();
		await nextConversation();
	}

	if (event.key === '[') {
		event.preventDefault();
		await previousConversation();
	}

	const number = Number.parseInt(event.code.slice(-1), 10);

	if (number >= 1 && number <= 9) {
		await jumpToConversation(number);
	}
});

// Pass events sent via `window.postMessage` on to the main process
window.addEventListener('message', async ({data: {type, data}}) => {
	if (type === 'notification') {
		showNotification(data as NotificationEvent);
	}

	if (type === 'notification-reply') {
		await sendReply(data.reply as string);

		if (data.previousConversation) {
			await selectConversation(data.previousConversation as number);
		}
	}
});

function showNotification({id, href, title, body, icon, silent}: NotificationEvent): void {
	const image = new Image();
	image.crossOrigin = 'anonymous';
	let didSend = false;

	const send = (iconData = ''): void => {
		if (didSend) {
			return;
		}

		didSend = true;
		ipc.callMain('notification', {
			id,
			href,
			title,
			body,
			icon: iconData,
			silent,
		});
	};

	image.addEventListener('load', () => {
		const canvas = document.createElement('canvas');
		const context = canvas.getContext('2d')!;

		canvas.width = image.width;
		canvas.height = image.height;

		context.drawImage(image, 0, 0, image.width, image.height);

		send(canvas.toDataURL());
	});

	image.addEventListener('error', () => {
		send();
	});

	window.setTimeout(() => {
		send();
	}, 1500);

	image.src = icon;
}

async function sendReply(message: string): Promise<void> {
	const inputField = document.querySelector<HTMLElement>('[contenteditable="true"]');
	if (!inputField) {
		return;
	}

	const previousMessage = inputField.textContent;

	// Send message
	inputField.focus();
	insertMessageText(message, inputField);

	const sendButton = await elementReady<HTMLElement>('._30yy._38lh', {stopOnDomReady: false});
	if (!sendButton) {
		console.error('Could not find send button');
		return;
	}

	sendButton.click();

	// Restore (possible) previous message
	if (previousMessage) {
		insertMessageText(previousMessage, inputField);
	}
}

function insertMessageText(text: string, inputField: HTMLElement): void {
	// Workaround: insert placeholder value to get execCommand working
	if (!inputField.textContent) {
		const event = new InputEvent('textInput', {
			bubbles: true,
			cancelable: true,
			data: '_',
			view: window,
		});
		inputField.dispatchEvent(event);
	}

	document.execCommand('selectAll', false, undefined);
	document.execCommand('insertText', false, text);
}

ipc.answerMain('notification-callback', async (data: any) => {
	window.postMessage({type: 'notification-callback', data}, '*');

	if (data.href) {
		await elementReady(selectors.conversationList, {stopOnDomReady: false});
		const link = document.querySelector<HTMLElement>(
			`${selectors.conversationList} [role="row"] [role="link"][href="${data.href}"]`,
		);
		link?.click();
	}
});

ipc.answerMain('notification-reply-callback', async (data: any) => {
	const previousConversation = selectedConversationIndex();
	data.previousConversation = previousConversation;
	window.postMessage({type: 'notification-reply-callback', data}, '*');
});

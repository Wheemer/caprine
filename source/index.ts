import path from 'node:path';
import {readFileSync, existsSync, promises as fs} from 'node:fs';
import {exec} from 'node:child_process';
import process from 'node:process';
import {
	app,
	nativeImage,
	screen as electronScreen,
	session,
	shell,
	BrowserWindow,
	BrowserView,
	Menu,
	Notification,
	MenuItemConstructorOptions,
	systemPreferences,
	nativeTheme,
	webFrameMain,
	type Event as ElectronEvent,
} from 'electron';
import {ipcMain as ipc} from 'electron-better-ipc';
import {autoUpdater} from 'electron-updater';
import electronDl from 'electron-dl';
import electronContextMenu from 'electron-context-menu';
import electronLocalshortcut from 'electron-localshortcut';
import electronDebug from 'electron-debug';
import {is, darkMode} from 'electron-util';
import {bestFacebookLocaleFor} from 'facebook-locales';
import doNotDisturb from '@sindresorhus/do-not-disturb';
import updateAppMenu from './menu';
import config, {StoreType} from './config';
import tray from './tray';
import {
	sendAction,
	sendBackgroundAction,
	showAndFocusWindow,
	messengerDomain,
	stripTrackingFromUrl,
} from './util';
import {process as processEmojiUrl} from './emoji';
import ensureOnline from './ensure-online';
import {setUpMenuBarMode} from './menu-bar-mode';
import {caprineBlueIcoPath, caprineIconPath} from './constants';
import {logDiagnostic} from './diagnostics';
import {markWindowHiddenByBlur, wasWindowOpenRequestedByUser} from './startup-visibility';

ipc.setMaxListeners(100);

electronDebug({
	isEnabled: true, // TODO: This is only enabled to allow `Command+R` because facebook.com sometimes gets stuck after computer waking up
	showDevTools: false,
});

electronDl();
electronContextMenu({
	showCopyImageAddress: true,
	prepend(defaultActions) {
	/*
		TODO: Use menu option or use replacement of options (https://github.com/sindresorhus/electron-context-menu/issues/70)
	*/
		defaultActions.copyLink({
			transform: stripTrackingFromUrl,
		});

		return [];
	},
});

app.setAppUserModelId('com.wheemer.caprine');

if (!config.get('hardwareAcceleration')) {
	app.disableHardwareAcceleration();
}

if (!is.development && config.get('autoUpdate')) {
	(async () => {
		const FOUR_HOURS = 1000 * 60 * 60 * 4;
		setInterval(async () => {
			await autoUpdater.checkForUpdatesAndNotify();
		}, FOUR_HOURS);

		await autoUpdater.checkForUpdatesAndNotify();
	})();
}

let mainWindow: BrowserWindow;
let isQuitting = false;
let previousMessageCount = 0;
let dockMenu: Menu;
let isDNDEnabled = false;
const notificationBridgeScript = readFileSync(path.join(__dirname, 'notifications-isolated.js'), 'utf8');
let previousTrayRenderKey = '';
let startupSplashView: BrowserView | undefined;
let startupSplashViewTimer: NodeJS.Timeout | undefined;
let suppressBlurHideUntil = 0;

function suppressStartupBlurHide(duration = 15_000): void {
	suppressBlurHideUntil = Math.max(suppressBlurHideUntil, Date.now() + duration);
}

function isStartupBlurHideSuppressed(): boolean {
	return Boolean(startupSplashView) || Date.now() < suppressBlurHideUntil;
}

function appIconDataUrl(): string {
	const iconBuffer = readFileSync(path.join(__dirname, '..', 'static', 'IconSplash.png'));
	return `data:image/png;base64,${iconBuffer.toString('base64')}`;
}

function startupSplashHtml(): string {
	const icon = appIconDataUrl();
	return `
		<!doctype html>
		<html>
			<head>
				<meta charset="utf-8">
				<style>
					html,
					body {
						width: 100%;
						height: 100%;
						margin: 0;
						overflow: hidden;
						background: #18191a;
					}

					body {
						display: grid;
						place-items: center;
						font-family: "Segoe UI", system-ui, sans-serif;
						color: #f0f2f5;
						user-select: none;
					}

					.splash {
						display: grid;
						justify-items: center;
						gap: 20px;
						opacity: 0;
						transform: translateY(8px) scale(.98);
						animation: splash-in 180ms ease-out forwards;
					}

					img {
						width: 172px;
						height: 172px;
						object-fit: contain;
					}

					.title {
						font-size: 38px;
						font-weight: 700;
						letter-spacing: 0;
					}

					.spinner {
						width: 34px;
						height: 34px;
						margin-top: 4px;
						border: 3px solid rgba(240, 242, 245, .22);
						border-top-color: #1877f2;
						border-radius: 50%;
						animation: spin 780ms linear infinite;
					}

					.version {
						margin-top: 2px;
						color: rgba(240, 242, 245, .58);
						font-size: 12px;
						font-weight: 500;
					}

					@keyframes splash-in {
						to {
							opacity: 1;
							transform: translateY(0) scale(1);
						}
					}

					@keyframes spin {
						to {
							transform: rotate(360deg);
						}
					}
				</style>
			</head>
			<body>
				<div class="splash">
					<img src="${icon}" alt="">
					<div class="title">Caprine</div>
					<div class="spinner" aria-hidden="true"></div>
					<div class="version">v${app.getVersion()}</div>
				</div>
			</body>
		</html>
	`;
}

function startupSplashUrl(): string {
	return `data:text/html;charset=utf-8,${encodeURIComponent(startupSplashHtml())}`;
}

function showStartupSplashView(win: BrowserWindow): void {
	if (!is.windows || startupSplashView !== undefined || shouldStartHiddenOnLaunch()) {
		return;
	}

	suppressStartupBlurHide();
	startupSplashView = new BrowserView({
		webPreferences: {
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true,
		},
	});

	const bounds = win.getBounds();
	win.addBrowserView(startupSplashView);
	startupSplashView.setBounds({
		x: 0,
		y: 0,
		width: bounds.width,
		height: bounds.height,
	});
	startupSplashView.setAutoResize({width: true, height: true});
	startupSplashView.webContents.loadURL(startupSplashUrl());

	if (startupSplashViewTimer) {
		clearTimeout(startupSplashViewTimer);
	}

	startupSplashViewTimer = setTimeout(() => {
		hideStartupSplashView();
	}, 12_000);
}

function hideStartupSplashView(): void {
	if (startupSplashViewTimer) {
		clearTimeout(startupSplashViewTimer);
		startupSplashViewTimer = undefined;
	}

	if (!mainWindow || !startupSplashView) {
		startupSplashView = undefined;
		return;
	}

	try {
		mainWindow.removeBrowserView(startupSplashView);
	} catch {}

	startupSplashView = undefined;
}

function shouldStartHiddenOnLaunch(): boolean {
	if (is.windows) {
		return config.get('launchMinimized');
	}

	return config.get('launchMinimized') || app.getLoginItemSettings().wasOpenedAsHidden;
}

async function installNotificationBridgeInFrame(frameProcessId: number, frameRoutingId: number): Promise<void> {
	const frame = webFrameMain.fromId(frameProcessId, frameRoutingId);
	if (!frame || frame.url.startsWith('devtools://')) {
		return;
	}

	try {
		await frame.executeJavaScript(notificationBridgeScript);
		logDiagnostic('notification.bridge.frame-installed', {
			url: frame.url,
			isMainFrame: !frame.parent,
		}, mainWindow);
	} catch (error: unknown) {
		logDiagnostic('notification.bridge.frame-failed', {
			url: frame.url,
			error: error instanceof Error ? error.message : String(error),
		}, mainWindow);
	}
}

function setWindowsMediaViewerControlsHidden(hidden: boolean): void {
	if (!is.windows || !mainWindow || mainWindow.isDestroyed()) {
		return;
	}

	logDiagnostic('media-viewer.window-controls', {open: hidden}, mainWindow);
}

function saveWindowState(): void {
	if (!mainWindow) {
		return;
	}

	const bounds = mainWindow.getNormalBounds();
	const {isMaximized} = config.get('lastWindowState');

	// Validate window dimensions - ensure they're at least minimum size
	// This prevents saving corrupted/invalid window states on Linux
	const validWidth = Math.max(bounds.width, 400);
	const validHeight = Math.max(bounds.height, 200);

	// Get the scale factor of the display where the window is located
	// This is needed to handle HiDPI/fractional scaling on Linux
	const display = electronScreen.getDisplayMatching(bounds);
	const {scaleFactor} = display;

	config.set('lastWindowState', {
		x: bounds.x,
		y: bounds.y,
		width: validWidth,
		height: validHeight,
		isMaximized,
		scaleFactor,
	});
}

if (!app.requestSingleInstanceLock()) {
	app.quit();
}

app.on('second-instance', () => {
	if (mainWindow) {
		showAndFocusWindow(mainWindow);
	}
});

// Preserves the window position when a display is removed and Caprine is moved to a different screen.
app.on('ready', () => {
	electronScreen.on('display-removed', () => {
		const [x, y] = mainWindow.getPosition();
		mainWindow.setPosition(x, y);
	});
});

async function updateTrayIcon(messageCount: number, isOnline: boolean): Promise<void> {
	logDiagnostic('tray.update.requested', {messageCount, isOnline}, mainWindow);

	if (!is.windows && !is.linux) {
		tray.update(messageCount, undefined, isOnline);
		return;
	}

	const trayRenderKey = `${messageCount}:${isOnline}:${config.get('showUnreadBadge')}`;
	if (trayRenderKey === previousTrayRenderKey) {
		tray.update(messageCount, undefined, isOnline);
		logDiagnostic('tray.update.skipped-unchanged', {messageCount, isOnline}, mainWindow);
		return;
	}

	try {
		const trayIcon = await ipc.callRenderer<TrayIconState, RenderedTrayIcon>(mainWindow, 'render-tray-icon', {messageCount, isOnline});
		previousTrayRenderKey = trayRenderKey;
		tray.update(messageCount, trayIcon.data, isOnline);
		logDiagnostic('tray.update.rendered', {messageCount, isOnline, hasCustomIcon: Boolean(trayIcon.data)}, mainWindow);
	} catch {
		logDiagnostic('tray.update.render-failed', {messageCount, isOnline}, mainWindow);
		tray.update(messageCount, undefined, isOnline);
	}
}

async function updateBadge(messageCount: number, isOnline = true): Promise<void> {
	// Close all notifications when all messages are read to clear GNOME dock badge
	if (messageCount === 0 && notifications.size > 0) {
		for (const [id, notification] of notifications) {
			notification.close();
			notifications.delete(id);
		}
	}

	if (!is.windows) {
		app.badgeCount = (config.get('showUnreadBadge') && !isDNDEnabled) ? messageCount : 0;

		if (
			is.macos
			&& !isDNDEnabled
			&& config.get('bounceDockOnMessage')
			&& previousMessageCount !== messageCount
		) {
			app.dock.bounce('informational');
		}
	}

	if (!is.macos) {
		tray.setBadge(config.get('showUnreadBadge') && isOnline ? messageCount > 0 : false);

		if (config.get('flashWindowOnMessage')) {
			// Only flash when there are new unread messages (count increased from previous)
			// This prevents repeated flashing from DOM mutations without new messages
			const hasNewMessages = messageCount > previousMessageCount;

			if (hasNewMessages) {
				mainWindow.flashFrame(true);
			} else if (messageCount === 0) {
				// Reset flash state when all messages are read
				mainWindow.flashFrame(false);
			}
		}
	}

	await updateTrayIcon(messageCount, isOnline);

	if (is.windows) {
		if (!config.get('showUnreadBadge') || !isOnline || messageCount === 0) {
			mainWindow.setOverlayIcon(null, '');
		} else {
			// Delegate drawing of overlay icon to renderer process
			updateOverlayIcon(await ipc.callRenderer(mainWindow, 'render-overlay-icon', messageCount));
		}
	}

	// Update previousMessageCount for next comparison
	// This is used to detect new messages vs repeated DOM mutations
	previousMessageCount = messageCount;
}

function updateOverlayIcon({data, text}: {data: string; text: string}): void {
	const img = nativeImage.createFromDataURL(data);
	mainWindow.setOverlayIcon(img, text);
}

function updateTitlebar(messageCount: number): void {
	if (!config.get('showUnreadCountOnTitlebar') || messageCount === 0) {
		mainWindow.setTitle(app.name);
	} else {
		mainWindow.setTitle(`(${messageCount}) ${app.name}`);
	}
}

type BeforeSendHeadersResponse = {
	cancel?: boolean;
	requestHeaders?: Record<string, string>;
};

type OnSendHeadersDetails = {
	id: number;
	url: string;
	method: string;
	webContentsId?: number;
	resourceType: string;
	referrer: string;
	timestamp: number;
	requestHeaders: Record<string, string>;
};

function classifyAcknowledgementUrl(url: string): string | undefined {
	if (url.includes('change_read_status.php')) {
		return 'seen';
	}

	if (url.includes('delivery_receipts')) {
		return 'delivery-receipt';
	}

	if (url.includes('unread_threads')) {
		return 'unread-thread-sync';
	}

	if (url.includes('typ.php')) {
		return 'typing';
	}

	return undefined;
}

function safeUrlPath(url: string): string {
	const {hostname, pathname} = new URL(url);
	return `${hostname}${pathname}`;
}

function enableHiresResources(): void {
	const scaleFactor = Math.max(
		...electronScreen.getAllDisplays().map(display => display.scaleFactor),
	);

	if (scaleFactor === 1) {
		return;
	}

	const filter = {urls: [`*://*.${messengerDomain}/`]};

	session.defaultSession.webRequest.onBeforeSendHeaders(
		filter,
		(details: OnSendHeadersDetails, callback: (response: BeforeSendHeadersResponse) => void) => {
			let cookie = details.requestHeaders.Cookie;

			if (cookie && details.method === 'GET') {
				cookie = /(?:; )?dpr=\d/.test(cookie) ? cookie.replace(/dpr=\d/, `dpr=${scaleFactor}`) : `${cookie}; dpr=${scaleFactor}`;

				(details.requestHeaders as any).Cookie = cookie;
			}

			callback({
				cancel: false,
				requestHeaders: details.requestHeaders,
			});
		},
	);
}

function initRequestsFiltering(): void {
	const filter = {
		urls: [
			`*://*.${messengerDomain}/*typ.php*`, // Type indicator blocker
			`*://*.${messengerDomain}/*change_read_status.php*`, // Seen indicator blocker
			`*://*.${messengerDomain}/*delivery_receipts*`, // Delivery receipts indicator blocker
			`*://*.${messengerDomain}/*unread_threads*`, // Delivery receipts indicator blocker
			'*://*.fbcdn.net/images/emoji.php/v9/*', // Emoji
			'*://*.facebook.com/images/emoji.php/v9/*', // Emoji
		],
	};

	session.defaultSession.webRequest.onBeforeRequest(filter, async ({url, method}, callback) => {
		if (url.includes('emoji.php')) {
			callback(await processEmojiUrl(url));
		} else if (url.includes('typ.php')) {
			const cancel = config.get('block.typingIndicator' as any);
			logDiagnostic('ack.before-request', {
				kind: 'typing',
				path: safeUrlPath(url),
				method,
				cancel,
			});
			callback({cancel});
		} else if (url.includes('change_read_status.php')) {
			const cancel = config.get('block.chatSeen' as any);
			logDiagnostic('ack.before-request', {
				kind: 'seen',
				path: safeUrlPath(url),
				method,
				cancel,
			});
			callback({cancel});
		} else if (url.includes('delivery_receipts') || url.includes('unread_threads')) {
			const kind = classifyAcknowledgementUrl(url);
			const cancel = config.get('block.deliveryReceipt' as any);
			logDiagnostic('ack.before-request', {
				kind,
				path: safeUrlPath(url),
				method,
				cancel,
			});
			callback({cancel});
		}
	});

	session.defaultSession.webRequest.onCompleted(filter, ({url, method, statusCode}) => {
		const kind = classifyAcknowledgementUrl(url);
		if (kind) {
			logDiagnostic('ack.completed', {
				kind,
				path: safeUrlPath(url),
				method,
				statusCode,
			});
		}
	});

	session.defaultSession.webRequest.onErrorOccurred(filter, ({url, method, error}) => {
		const kind = classifyAcknowledgementUrl(url);
		if (kind) {
			logDiagnostic('ack.error', {
				kind,
				path: safeUrlPath(url),
				method,
				error,
			});
		}
	});

	session.defaultSession.webRequest.onHeadersReceived({
		urls: ['*://static.xx.fbcdn.net/rsrc.php/*'],
	}, ({responseHeaders}, callback) => {
		if (!config.get('callRingtoneMuted') || !responseHeaders) {
			callback({});
			return;
		}

		const callRingtoneHash = '2NAu/QVqg211BbktgY5GkA==';
		callback({
			cancel: responseHeaders['content-md5'][0] === callRingtoneHash,
		});
	});
}

function setUserLocale(): void {
	const userLocale = bestFacebookLocaleFor(app.getLocale().replace('-', '_'));
	const cookie = {
		url: 'https://www.facebook.com/',
		name: 'locale',
		secure: true,
		value: userLocale,
	};

	session.defaultSession.cookies.set(cookie);
}

function setNotificationsMute(status: boolean): void {
	const label = 'Mute Notifications';
	const muteMenuItem = Menu.getApplicationMenu()!.getMenuItemById('mute-notifications')!;

	config.set('notificationsMuted', status);
	muteMenuItem.checked = status;

	if (is.macos) {
		const item = dockMenu.items.find(x => x.label === label);
		item!.checked = status;
	}
}

function createMainWindow(): BrowserWindow {
	logDiagnostic('main-window.create.start', {
		launchMinimized: config.get('launchMinimized'),
		wasOpenedAsHidden: app.getLoginItemSettings().wasOpenedAsHidden,
	});

	const lastWindowState = config.get('lastWindowState');

	// Messenger or Work Chat
	const mainURL = config.get('useWorkChat')
		? 'https://work.facebook.com/chat'
		: 'https://www.facebook.com/messages/';

	// Determine background color based on theme to prevent flash of white
	const theme = config.get('theme');
	const shouldUseDarkColors = theme === 'dark' || (theme === 'system' && nativeTheme.shouldUseDarkColors);
	const backgroundColor = is.windows ? '#18191a' : (shouldUseDarkColors ? '#1e1e1e' : undefined);

	// Handle HiDPI/fractional scaling on Linux
	// getNormalBounds() returns logical pixels (scaled by display scale factor)
	// We need to convert saved logical pixels to physical pixels, then to current display's logical pixels
	let windowWidth = lastWindowState.width;
	let windowHeight = lastWindowState.height;

	if (is.linux && lastWindowState.scaleFactor) {
		// Get the display where the window will be created
		const display = electronScreen.getDisplayNearestPoint({
			x: lastWindowState.x ?? 0,
			y: lastWindowState.y ?? 0,
		});
		const currentScaleFactor = display.scaleFactor;
		const savedScaleFactor = lastWindowState.scaleFactor;

		if (savedScaleFactor !== currentScaleFactor) {
			// Convert: saved_logical * saved_scale / current_scale = current_logical
			// This maintains the same physical pixel size
			windowWidth = Math.round((windowWidth * savedScaleFactor) / currentScaleFactor);
			windowHeight = Math.round((windowHeight * savedScaleFactor) / currentScaleFactor);
		}
	}

	const win = new BrowserWindow({
		title: app.name,
		show: false,
		x: lastWindowState.x,
		y: lastWindowState.y,
		width: windowWidth,
		height: windowHeight,
		icon: is.windows ? caprineBlueIcoPath : caprineIconPath,
		skipTaskbar: !config.get('showTaskbarIcon'),
		minWidth: 400,
		minHeight: 200,
		alwaysOnTop: config.get('alwaysOnTop'),
		frame: false,
		trafficLightPosition: {
			x: 18,
			y: 16,
		},
		autoHideMenuBar: config.get('autoHideMenuBar'),
		backgroundColor,
		webPreferences: {
			preload: path.join(__dirname, 'browser.js'),
			contextIsolation: true,
			nodeIntegration: true,
			spellcheck: config.get('isSpellCheckerEnabled'),
			plugins: true,
			backgroundThrottling: false,
		},
	});

	require('@electron/remote/main').initialize();
	require('@electron/remote/main').enable(win.webContents);

	if (is.windows) {
		win.setMinimizable(true);
		win.setMaximizable(true);
	}

	setUserLocale();
	initRequestsFiltering();

	let previousDarkMode = darkMode.isEnabled;
	darkMode.onChange(() => {
		if (darkMode.isEnabled !== previousDarkMode) {
			previousDarkMode = darkMode.isEnabled;
			win.webContents.send('set-theme');
		}
	});

	if (is.macos) {
		win.setSheetOffset(40);
	}

	showStartupSplashView(win);
	win.loadURL(mainURL);
	logDiagnostic('main-window.load-url', {url: mainURL}, win);

	if (is.windows && !shouldStartHiddenOnLaunch()) {
		suppressStartupBlurHide();

		if (config.get('lastWindowState').isMaximized) {
			win.maximize();
		}

		logDiagnostic('startup.path.show-window-immediate.before-show', {}, win);
		win.show();
		logDiagnostic('startup.path.show-window-immediate.after-show', {}, win);
	}

	win.on('close', event => {
		logDiagnostic('window.event.close', {
			isQuitting,
			quitOnWindowClose: config.get('quitOnWindowClose'),
		}, win);
		hideStartupSplashView();

		if (config.get('quitOnWindowClose')) {
			app.quit();
			return;
		}

		// Workaround for https://github.com/electron/electron/issues/20263
		// Closing the app window when on full screen leaves a black screen
		// Exit fullscreen before closing
		if (is.macos && mainWindow.isFullScreen()) {
			mainWindow.once('leave-full-screen', () => {
				mainWindow.hide();
			});
			mainWindow.setFullScreen(false);
		}

		if (!isQuitting) {
			event.preventDefault();

			// Workaround for https://github.com/electron/electron/issues/10023
			win.blur();
			if (is.macos) {
				// On macOS we're using `app.hide()` in order to focus the previous window correctly
				app.hide();
			} else {
				win.hide();
			}
		}
	});

	win.on('show', () => {
		logDiagnostic('window.event.show', {}, win);
	});

	win.on('hide', () => {
		logDiagnostic('window.event.hide', {}, win);
		hideStartupSplashView();
	});

	win.on('focus', () => {
		logDiagnostic('window.event.focus', {}, win);

		if (config.get('flashWindowOnMessage')) {
			// This is a security in the case where messageCount is not reset by page title update
			win.flashFrame(false);
		}
	});

	win.on('blur', () => {
		logDiagnostic('window.event.blur', {}, win);

		if (config.get('hideWindowOnBlur') && !is.macos && win.isVisible() && !win.isMinimized()) {
			if (isStartupBlurHideSuppressed()) {
				logDiagnostic('window.event.blur.hide-to-tray.suppressed-startup', {}, win);
				return;
			}

			markWindowHiddenByBlur();
			win.hide();
			logDiagnostic('window.event.blur.hide-to-tray', {}, win);
		}
	});

	win.on('minimize', (event: ElectronEvent) => {
		logDiagnostic('window.event.minimize', {}, win);

		if (config.get('hideWindowOnMinimize') && !is.macos) {
			event.preventDefault();
			win.hide();
			logDiagnostic('window.event.minimize.hide-to-tray', {}, win);
		}
	});

	win.on('restore', () => {
		logDiagnostic('window.event.restore', {}, win);
	});

	win.on('resize', () => {
		saveWindowState();
	});

	win.on('maximize', () => {
		config.set('lastWindowState.isMaximized', true);
	});

	win.on('unmaximize', () => {
		config.set('lastWindowState.isMaximized', false);
	});

	return win;
}

(async () => {
	await Promise.all([ensureOnline(), app.whenReady()]);
	logDiagnostic('app.ready');
	await updateAppMenu();
	mainWindow = createMainWindow();

	if (is.windows) {
		const jumpToConversationMatch = process.argv.find(argument => /^--jump-to-conversation=\d+$/.test(argument));
		if (jumpToConversationMatch) {
			const conversationIndex = Number.parseInt(jumpToConversationMatch.split('=')[1], 10);
			await ipc.callRenderer(mainWindow, 'jump-to-conversation', conversationIndex);
		}
	}

	// Workaround for https://github.com/electron/electron/issues/5256
	electronLocalshortcut.register(mainWindow, 'CommandOrControl+=', () => {
		sendAction('zoom-in');
	});

	// Register alternative shortcuts for Linux/GNOME which uses Ctrl+0/+/− for system zoom
	if (is.linux) {
		electronLocalshortcut.register(mainWindow, 'Alt+0', () => {
			sendAction('zoom-reset');
		});
		electronLocalshortcut.register(mainWindow, 'Alt+Plus', () => {
			sendAction('zoom-in');
		});
		electronLocalshortcut.register(mainWindow, 'Alt+=', () => {
			sendAction('zoom-in');
		});
		electronLocalshortcut.register(mainWindow, 'Alt+-', () => {
			sendAction('zoom-out');
		});
	}

	// Handle numpad keys manually since electron-localshortcut doesn't support them
	mainWindow.webContents.on('before-input-event', (event, input) => {
		const hasAlt = input.modifiers?.includes('alt');
		const hasControl = input.modifiers?.includes('control');
		const hasMeta = input.modifiers?.includes('meta');
		const hasShift = input.modifiers?.includes('shift');
		const isPlainAltKey = (
			input.key === 'Alt'
			|| input.code === 'AltLeft'
			|| input.code === 'AltRight'
		) && !hasControl && !hasMeta && !hasShift;

		if (input.type !== 'keyDown') {
			return;
		}

		if (
			is.windows
			&& config.get('autoHideMenuBar')
			&& isPlainAltKey
		) {
			event.preventDefault();
			logDiagnostic('keyboard.alt.toggle-custom-menu-bar', {
				key: input.key,
				code: input.code,
			}, mainWindow);
			void ipc.callRenderer(mainWindow, 'toggle-custom-menu-bar');
			return;
		}

		if (hasAlt || hasControl || hasMeta) {
			switch (input.code) {
				case 'Numpad0': {
					event.preventDefault();
					sendAction('zoom-reset');
					break;
				}

				case 'NumpadAdd':
				case 'NumpadEqual': {
					event.preventDefault();
					sendAction('zoom-in');
					break;
				}

				case 'NumpadSubtract': {
					event.preventDefault();
					sendAction('zoom-out');
					break;
				}

				default: {
					break;
				}
			}
		}
	});

	// Start in menu bar mode if enabled, otherwise start normally
	setUpMenuBarMode(mainWindow);

	if (is.macos) {
		const firstItem: MenuItemConstructorOptions = {
			label: 'Mute Notifications',
			type: 'checkbox',
			visible: is.development,
			checked: false,
			async click(menuItem) {
				setNotificationsMute(await ipc.callRenderer(mainWindow, 'toggle-mute-notifications', {checked: menuItem.checked}));
			},
		};

		dockMenu = Menu.buildFromTemplate([firstItem]);
		app.dock.setMenu(dockMenu);

		// Dock icon is hidden initially on macOS
		if (config.get('showDockIcon')) {
			app.dock.show();
		}

		ipc.once('conversations', () => {
			// Messenger sorts the conversations by unread state.
			// We select the first conversation from the list.
			sendAction('jump-to-conversation', 1);
		});

		ipc.answerRenderer('conversations', (conversations: Conversation[]) => {
			if (conversations.length === 0) {
				return;
			}

			const items = conversations.slice(0, 10).map(({label, icon}, index) => ({
				label: `${label}`,
				icon: nativeImage.createFromDataURL(icon),
				click() {
					mainWindow.show();
					sendAction('jump-to-conversation', index + 1);
				},
			}));

			app.dock.setMenu(Menu.buildFromTemplate([firstItem, {type: 'separator'}, ...items]));
		});
	}

	if (is.windows) {
		ipc.answerRenderer('conversations', (conversations: Conversation[]) => {
			if (conversations.length === 0) {
				app.setJumpList([]);
				return;
			}

			const recentConversations = conversations.slice(0, 10);
			const tasks = recentConversations.map(({label}, index) => ({
				type: 'task' as const,
				title: label,
				program: process.execPath,
				args: '--jump-to-conversation=' + (index + 1),
				iconPath: is.windows ? caprineBlueIcoPath : caprineIconPath,
				iconIndex: 0,
				description: `Open ${label}`,
			}));

			app.setJumpList([
				{
					type: 'custom',
					name: 'Conversations',
					items: tasks,
				},
			]);
		});
	}

	// Update badge on conversations change
	ipc.answerRenderer('update-tray-icon', async (state: number | TrayIconState) => {
		if (typeof state === 'number') {
			await updateBadge(state);
			return;
		}

		await updateBadge(state.messageCount, state.isOnline);
	});

	// Update titlebar on unread count change
	ipc.answerRenderer('update-titlebar-count', (messageCount: number) => {
		updateTitlebar(messageCount);
	});

	enableHiresResources();

	const {webContents} = mainWindow;

	webContents.on('dom-ready', async () => {
		logDiagnostic('webcontents.event.dom-ready', {
			launchMinimized: config.get('launchMinimized'),
			wasOpenedAsHidden: app.getLoginItemSettings().wasOpenedAsHidden,
		}, mainWindow);

		// Set window title to Caprine (or with unread count if feature enabled)
		updateTitlebar(previousMessageCount);

		await updateAppMenu();

		const files = ['browser.css', 'dark-mode.css', 'vibrancy.css', 'code-blocks.css', 'autoplay.css', 'scrollbar.css'];

		const cssPath = path.join(__dirname, '..', 'css');

		for (const file of files) {
			if (existsSync(path.join(cssPath, file))) {
				webContents.insertCSS(readFileSync(path.join(cssPath, file), 'utf8'));
			}
		}

		if (config.get('useWorkChat') && existsSync(path.join(cssPath, 'workchat.css'))) {
			webContents.insertCSS(
				readFileSync(path.join(cssPath, 'workchat.css'), 'utf8'),
			);
		}

		if (existsSync(path.join(app.getPath('userData'), 'custom.css'))) {
			webContents.insertCSS(readFileSync(path.join(app.getPath('userData'), 'custom.css'), 'utf8'));
		}

		if (is.windows && !shouldStartHiddenOnLaunch()) {
			tray.create(mainWindow);
			logDiagnostic('startup.path.show-window-immediate.dom-ready-skip-show', {}, mainWindow);
		} else if (shouldStartHiddenOnLaunch() && !wasWindowOpenRequestedByUser()) {
			logDiagnostic('startup.path.launch-hidden.before-hide-create-tray', {}, mainWindow);
			mainWindow.hide();
			tray.create(mainWindow);
			logDiagnostic('startup.path.launch-hidden.after-hide-create-tray', {}, mainWindow);
		} else {
			if (config.get('lastWindowState').isMaximized) {
				mainWindow.maximize();
			}

			logDiagnostic('startup.path.show-window.before-show', {}, mainWindow);
			mainWindow.show();
			logDiagnostic('startup.path.show-window.after-show', {}, mainWindow);
		}

		if (is.macos) {
			// TODO: 'update-dnd-mode' is not called
			ipc.answerRenderer('update-dnd-mode', async (initialSoundsValue: boolean) => {
				doNotDisturb.on('change', (doNotDisturb: boolean) => {
					isDNDEnabled = doNotDisturb;
					ipc.callRenderer(mainWindow, 'toggle-sounds', {checked: isDNDEnabled ? false : initialSoundsValue});
				});

				isDNDEnabled = await doNotDisturb.isEnabled();

				return isDNDEnabled ? false : initialSoundsValue;
			});
		}

		ipc.callRenderer(mainWindow, 'toggle-message-buttons', config.get('showMessageButtons'));

		if (is.macos) {
			await import('./touch-bar');
		}
	});

	webContents.on('did-frame-finish-load', async (_event, _isMainFrame, frameProcessId, frameRoutingId) => {
		await installNotificationBridgeInFrame(frameProcessId, frameRoutingId);
	});

	webContents.setWindowOpenHandler(details => {
		if (details.disposition === 'foreground-tab' || details.disposition === 'background-tab') {
			const url = stripTrackingFromUrl(details.url);
			shell.openExternal(url);
			return {action: 'deny'};
		}

		if (details.disposition === 'new-window') {
			if (details.url === 'about:blank' || details.url === 'about:blank#blocked') {
				if (details.frameName !== 'about:blank') {
					// Voice/video call popup
					return {
						action: 'allow',
						overrideBrowserWindowOptions: {
							show: true,
							titleBarStyle: 'default',
							webPreferences: {
								nodeIntegration: false,
								preload: path.join(__dirname, 'browser-call.js'),
							},
						},
					};
				}
			} else {
				const url = stripTrackingFromUrl(details.url);
				shell.openExternal(url);
			}

			return {action: 'deny'};
		}

		return {action: 'allow'};
	});

	webContents.on('will-navigate', async (event, url) => {
		const isFacebookMessages = (url: string): boolean => {
			const {hostname, pathname} = new URL(url);
			if (hostname !== 'www.facebook.com' && hostname !== 'web.facebook.com') {
				return false;
			}

			// Allow root path for login flow, but we'll redirect to /messages after
			if (pathname === '/' || pathname === '') {
				return true;
			}

			return (
				pathname.startsWith('/messages')
				|| pathname.startsWith('/login')
				|| pathname.startsWith('/checkpoint')
				|| pathname.startsWith('/two_step_verification')
				|| pathname.startsWith('/two_factor')
				|| pathname.startsWith('/logout')
			);
		};

		const isWorkChat = (url: string): boolean => {
			const {hostname, pathname} = new URL(url);

			if (hostname === 'work.facebook.com' || hostname === 'work.workplace.com') {
				return true;
			}

			if (
				// Example: https://company-name.facebook.com/login or
				//   		https://company-name.workplace.com/login
				(hostname.endsWith('.facebook.com') || hostname.endsWith('.workplace.com'))
				&& (pathname.startsWith('/login') || pathname.startsWith('/chat'))
			) {
				return true;
			}

			if (hostname === 'login.microsoftonline.com') {
				return true;
			}

			return false;
		};

		if (isFacebookMessages(url) || isWorkChat(url)) {
			return;
		}

		event.preventDefault();
		await shell.openExternal(url);
	});

	// Redirect from Facebook homepage to /messages after login
	webContents.on('did-navigate', (_event, url) => {
		const {hostname, pathname} = new URL(url);
		if ((hostname === 'www.facebook.com' || hostname === 'web.facebook.com') && (pathname === '/' || pathname === '')) {
			// Redirect to messages page after a short delay to allow any login process to complete
			setTimeout(() => {
				webContents.loadURL('https://www.facebook.com/messages/');
			}, 500);
		}
	});
})();

if (is.macos) {
	ipc.answerRenderer('set-vibrancy', () => {
		mainWindow.setBackgroundColor('#80FFFFFF'); // Transparent, workaround for vibrancy issue.
		mainWindow.setVibrancy('sidebar');
	});
}

function toggleMaximized(): void {
	if (mainWindow.isMaximized()) {
		mainWindow.unmaximize();
	} else {
		mainWindow.maximize();
	}
}

ipc.answerRenderer('titlebar-doubleclick', () => {
	if (is.macos) {
		const doubleClickAction = systemPreferences.getUserDefault('AppleActionOnDoubleClick', 'string');

		if (doubleClickAction === 'Minimize') {
			mainWindow.minimize();
		} else if (doubleClickAction === 'Maximize') {
			toggleMaximized();
		}
	} else {
		toggleMaximized();
	}
});

ipc.answerRenderer('window-control-minimize', () => {
	mainWindow.minimize();
});

ipc.answerRenderer('window-control-toggle-maximize', () => {
	toggleMaximized();
});

ipc.answerRenderer('window-control-close', () => {
	mainWindow.close();
});

ipc.answerRenderer('startup-splash-ready', () => {
	hideStartupSplashView();
});

ipc.answerRenderer('open-external', async (url: string) => {
	await shell.openExternal(url);
});

const cleanMenuLabel = (label: string): string => label
	.replaceAll('&', '')
	.replaceAll(/\t.*$/g, '');

ipc.answerRenderer('get-custom-menu-bar-items', () => {
	const menu = Menu.getApplicationMenu();

	if (!menu) {
		return [];
	}

	return menu.items
		.map((menuItem, index) => ({
			index,
			label: cleanMenuLabel(menuItem.label),
			enabled: menuItem.enabled,
		}))
		.filter(item => item.label.length > 0);
});

ipc.answerRenderer('popup-custom-menu-bar-item', ({index, x, y}: {index: number; x: number; y: number}) => {
	const menu = Menu.getApplicationMenu();
	const submenu = menu?.items[index]?.submenu;

	if (!submenu) {
		return;
	}

	submenu.popup({
		window: mainWindow,
		x: Math.round(x),
		y: Math.round(y),
	});
});

ipc.answerRenderer('navigate-to-chats', () => {
	mainWindow.webContents.loadURL('https://www.facebook.com/messages/');
});

ipc.answerRenderer('save-blob-file', async ({data, filename}: {data: ArrayBuffer; filename: string}) => {
	const downloadsDirectory = app.getPath('downloads');
	let savePath = path.join(downloadsDirectory, filename);
	let counter = 1;
	const {name, ext} = path.parse(filename);
	while (existsSync(savePath)) {
		savePath = path.join(downloadsDirectory, `${name} (${counter})${ext}`);
		counter++;
	}

	await fs.writeFile(savePath, Buffer.from(data));
	shell.showItemInFolder(savePath);
});

app.on('activate', () => {
	if (mainWindow) {
		mainWindow.show();
	}
});

app.on('before-quit', () => {
	isQuitting = true;

	// Save window state before quitting
	saveWindowState();

	if (is.windows) {
		app.setJumpList([]);
	}
});

// Handle Linux shutdown signals - SIGTERM is sent during logout/shutdown
if (is.linux) {
	process.on('SIGTERM', () => {
		saveWindowState();
		app.quit();
	});

	process.on('SIGHUP', () => {
		saveWindowState();
		app.quit();
	});
}

const notifications = new Map();
const notificationHrefs = new Map<number, string>();
const customNotificationWindows = new Map<number, BrowserWindow>();

function escapeHtml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll('\'', '&#39;');
}

function notificationSoundPath(): string {
	const appPath = app.getAppPath();
	const isAsar = appPath.includes('.asar');
	const basePath = isAsar ? appPath.replace('.asar', '.asar.unpacked') : appPath;
	return path.join(basePath, 'static', 'sounds', 'messenger-notification.mp3');
}

function playNotificationSound(): void {
	const soundPath = notificationSoundPath();

	if (is.macos) {
		exec(`afplay "${soundPath}"`);
	} else if (is.linux) {
		exec(`gst-play-1.0 --no-interactive --quiet "${soundPath}" 2>/dev/null || paplay "${soundPath}" 2>/dev/null || aplay "${soundPath}"`);
	} else if (is.windows) {
		exec(`powershell -c Add-Type -AssemblyName presentationCore; $player = New-Object system.windows.media.mediaplayer; $player.open('${soundPath}'); $player.Play(); Start-Sleep -s $player.NaturalDuration.TimeSpan.TotalSeconds`);
	}
}

function customNotificationHtml({id, title, body, icon}: {id: number; title: string; body: string; icon: string}): string {
	const appIcon = appIconDataUrl();
	const avatar = icon || appIcon;
	return `
		<!doctype html>
		<html>
			<head>
				<meta charset="utf-8">
				<style>
					html,
					body {
						width: 100%;
						height: 100%;
						margin: 0;
						overflow: hidden;
						background: transparent;
						font-family: "Segoe UI", system-ui, sans-serif;
						user-select: none;
					}

					.toast {
						box-sizing: border-box;
						width: 100%;
						height: 100%;
						display: grid;
						grid-template-columns: 44px 1fr 24px;
						gap: 12px;
						align-items: center;
						padding: 12px;
						border: 1px solid rgba(255, 255, 255, .12);
						border-radius: 8px;
						background: #242526;
						box-shadow: 0 12px 32px rgba(0, 0, 0, .35);
						color: #f0f2f5;
						cursor: default;
					}

					.toast:hover {
						background: #2d2f31;
					}

					.avatar {
						width: 44px;
						height: 44px;
						border-radius: 50%;
						object-fit: cover;
					}

					.title {
						margin: 0 0 4px;
						overflow: hidden;
						color: #fff;
						font-size: 14px;
						font-weight: 650;
						line-height: 18px;
						text-overflow: ellipsis;
						white-space: nowrap;
					}

					.body {
						display: -webkit-box;
						margin: 0;
						overflow: hidden;
						color: #d0d3d7;
						font-size: 13px;
						line-height: 17px;
						-webkit-box-orient: vertical;
						-webkit-line-clamp: 2;
					}

					.close {
						align-self: start;
						width: 22px;
						height: 22px;
						border: 0;
						border-radius: 50%;
						background: transparent;
						color: #d0d3d7;
						font-size: 18px;
						line-height: 20px;
					}

					.close:hover {
						background: rgba(255, 255, 255, .12);
						color: #fff;
					}
				</style>
			</head>
			<body>
				<div class="toast" id="toast">
					<img class="avatar" src="${avatar}" alt="">
					<div>
						<p class="title">${escapeHtml(title)}</p>
						<p class="body">${escapeHtml(body)}</p>
					</div>
					<button class="close" id="close" type="button" aria-label="Close">×</button>
				</div>
				<script>
					const {ipcRenderer} = require('electron');
					document.getElementById('toast').addEventListener('click', () => {
						ipcRenderer.send('caprine-custom-notification-click', ${id});
					});
					document.getElementById('close').addEventListener('click', event => {
						event.stopPropagation();
						ipcRenderer.send('caprine-custom-notification-close', ${id});
					});
				</script>
			</body>
		</html>
	`;
}

function positionCustomNotifications(): void {
	const display = electronScreen.getPrimaryDisplay();
	const {workArea} = display;
	const margin = 14;
	const width = 360;
	const height = 88;
	const gap = 10;
	const windows = [...customNotificationWindows.values()].filter(window => !window.isDestroyed());

	let index = 0;
	for (const window of windows) {
		window.setBounds({
			x: Math.round(workArea.x + workArea.width - width - margin),
			y: Math.round(workArea.y + workArea.height - ((height + gap) * (index + 1)) - margin),
			width,
			height,
		});
		index++;
	}
}

function closeCustomNotification(id: number, reason: 'click' | 'close' | 'timeout' = 'close'): void {
	const notificationWindow = customNotificationWindows.get(id);
	if (!notificationWindow) {
		return;
	}

	customNotificationWindows.delete(id);

	if (!notificationWindow.isDestroyed()) {
		notificationWindow.close();
	}

	if (reason !== 'click') {
		sendBackgroundAction('notification-callback', {callbackName: 'onclose', id});
	}

	positionCustomNotifications();
}

function showCustomNotification({id, href, title, body, icon}: {id: number; href?: string; title: string; body: string; icon: string}): void {
	closeCustomNotification(id, 'close');

	const notificationWindow = new BrowserWindow({
		width: 360,
		height: 88,
		show: false,
		frame: false,
		transparent: true,
		resizable: false,
		movable: false,
		minimizable: false,
		maximizable: false,
		closable: true,
		alwaysOnTop: true,
		skipTaskbar: true,
		focusable: false,
		acceptFirstMouse: true,
		webPreferences: {
			nodeIntegration: true,
			contextIsolation: false,
			backgroundThrottling: false,
		},
	});

	customNotificationWindows.set(id, notificationWindow);
	notifications.set(id, {
		close() {
			closeCustomNotification(id, 'close');
		},
	});

	if (href) {
		notificationHrefs.set(id, href);
	}

	notificationWindow.on('closed', () => {
		customNotificationWindows.delete(id);
		notifications.delete(id);
		notificationHrefs.delete(id);
		positionCustomNotifications();
	});

	notificationWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(customNotificationHtml({
		id,
		title,
		body,
		icon,
	}))}`);
	notificationWindow.once('ready-to-show', () => {
		positionCustomNotifications();
		notificationWindow.showInactive();
	});

	setTimeout(() => {
		closeCustomNotification(id, 'timeout');
	}, 7000);
}

ipc.on('caprine-custom-notification-click', (_event, id: number) => {
	showAndFocusWindow(mainWindow);
	sendAction('notification-callback', {
		callbackName: 'onclick',
		id,
		href: notificationHrefs.get(id),
	});
	closeCustomNotification(id, 'click');
});

ipc.on('caprine-custom-notification-close', (_event, id: number) => {
	closeCustomNotification(id, 'close');
});

ipc.answerRenderer(
	'notification',
	({id, href, title, body, icon, silent}: {id: number; href?: string; title: string; body: string; icon: string; silent: boolean}) => {
		logDiagnostic('notification.received', {
			id,
			hasHref: Boolean(href),
			hasTitle: Boolean(title),
			hasBody: Boolean(body),
			hasIcon: Boolean(icon),
			silent: Boolean(silent),
		}, mainWindow);

		// Don't send notifications when the window is focused
		if (mainWindow.isFocused()) {
			logDiagnostic('notification.skipped.focused', {id}, mainWindow);
			return;
		}

		// Close existing notification with the same ID if present (prevents duplicates on GNOME/Linux)
		if (notifications.has(id)) {
			notifications.get(id).close();
			notifications.delete(id);
			notificationHrefs.delete(id);
		}

		// Skip notification if notifications are muted
		if (config.get('notificationsMuted')) {
			logDiagnostic('notification.skipped.muted', {id}, mainWindow);
			return;
		}

		const displayBody = config.get('notificationMessagePreview') ? body : 'You have a new message';

		if (is.windows) {
			if (!silent) {
				playNotificationSound();
			}

			showCustomNotification({
				id,
				href,
				title,
				body: displayBody,
				icon,
			});
			logDiagnostic('notification.shown.custom', {id}, mainWindow);
			return;
		}

		const notification = new Notification({
			title,
			body: displayBody,
			hasReply: true,
			...(icon ? {icon: nativeImage.createFromDataURL(icon)} : {}),
			silent: silent || is.linux || is.macos,
		});

		notifications.set(id, notification);
		if (href) {
			notificationHrefs.set(id, href);
		}

		notification.on('click', () => {
			showAndFocusWindow(mainWindow);
			sendAction('notification-callback', {
				callbackName: 'onclick',
				id,
				href: notificationHrefs.get(id),
			});

			notifications.delete(id);
			notificationHrefs.delete(id);
		});

		notification.on('reply', (_event, reply: string) => {
			sendBackgroundAction('notification-reply-callback', {
				callbackName: 'onclick',
				id,
				reply,
				href: notificationHrefs.get(id),
			});

			notifications.delete(id);
			notificationHrefs.delete(id);
		});

		notification.on('close', () => {
			sendBackgroundAction('notification-callback', {callbackName: 'onclose', id});
			notifications.delete(id);
			notificationHrefs.delete(id);
		});

		if (!silent) {
			playNotificationSound();
		}

		notification.show();
		logDiagnostic('notification.shown', {id}, mainWindow);

		// Request window attention on Linux (Wayland-compatible)
		if (is.linux && config.get('flashWindowOnMessage')) {
			mainWindow.flashFrame(true);
			setTimeout(() => {
				mainWindow.flashFrame(false);
			}, 2000);
		}
	},
);

type ThemeSource = typeof nativeTheme.themeSource;

ipc.answerRenderer<undefined, StoreType['useWorkChat']>('get-config-useWorkChat', async () => config.get('useWorkChat'));
ipc.answerRenderer<undefined, StoreType['showMessageButtons']>('get-config-showMessageButtons', async () => config.get('showMessageButtons'));
ipc.answerRenderer<undefined, ThemeSource>('get-config-theme', async () => config.get('theme'));
ipc.answerRenderer<undefined, StoreType['privateMode']>('get-config-privateMode', async () => config.get('privateMode'));
ipc.answerRenderer<undefined, StoreType['vibrancy']>('get-config-vibrancy', async () => config.get('vibrancy'));
ipc.answerRenderer<undefined, StoreType['sidebar']>('get-config-sidebar', async () => config.get('sidebar'));
ipc.answerRenderer<undefined, StoreType['zoomFactor']>('get-config-zoomFactor', async () => config.get('zoomFactor'));
ipc.answerRenderer<StoreType['zoomFactor'], void>('set-config-zoomFactor', async zoomFactor => {
	config.set('zoomFactor', zoomFactor);
});
ipc.answerRenderer<boolean, void>('set-media-viewer-open', async open => {
	setWindowsMediaViewerControlsHidden(open);
	void ipc.callRenderer(mainWindow, 'set-custom-window-controls-media-viewer-open', open);
});
ipc.answerRenderer<undefined, StoreType['keepMeSignedIn']>('get-config-keepMeSignedIn', async () => config.get('keepMeSignedIn'));
ipc.answerRenderer<StoreType['keepMeSignedIn'], void>('set-config-keepMeSignedIn', async keepMeSignedIn => {
	config.set('keepMeSignedIn', keepMeSignedIn);
});
ipc.answerRenderer<undefined, StoreType['autoplayVideos']>('get-config-autoplayVideos', async () => config.get('autoplayVideos'));
ipc.answerRenderer<undefined, StoreType['emojiStyle']>('get-config-emojiStyle', async () => config.get('emojiStyle'));
ipc.answerRenderer<StoreType['emojiStyle'], void>('set-config-emojiStyle', async emojiStyle => {
	config.set('emojiStyle', emojiStyle);
});


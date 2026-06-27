import * as path from 'node:path';
import {
	app,
	Menu,
	Tray,
	BrowserWindow,
	MenuItemConstructorOptions,
	nativeImage,
} from 'electron';
import {is} from 'electron-util';
import config from './config';
import {toggleMenuBarMode} from './menu-bar-mode';
import {logDiagnostic} from './diagnostics';
import {markUserRequestedWindowOpen, wasWindowJustHiddenByBlur} from './startup-visibility';

let tray: Tray | undefined;
let previousMessageCount = 0;
let previousIsOnline = true;
let currentIconData: string | undefined;
let previousBadgeState: boolean | undefined;

let contextMenu: Menu;

export default {
	create(win: BrowserWindow) {
		if (tray) {
			logDiagnostic('tray.create.skipped-existing', {}, win);
			return;
		}

		function showWindow(): void {
			markUserRequestedWindowOpen();
			win.show();

			if (config.get('lastWindowState').isMaximized) {
				win.maximize();
				win.focus();
			}

			// Workaround for https://github.com/electron/electron/issues/20858
			// `setAlwaysOnTop` stops working after hiding the window on KDE Plasma.
			const alwaysOnTopMenuItem = Menu.getApplicationMenu()!.getMenuItemById('always-on-top')!;
			win.setAlwaysOnTop(alwaysOnTopMenuItem.checked);
			win.focus();
		}

		function toggleWindow(): void {
			logDiagnostic('tray.toggle.before', {}, win);

			if (win.isVisible()) {
				win.hide();
			} else if (wasWindowJustHiddenByBlur()) {
				logDiagnostic('tray.toggle.skipped-after-blur-hide', {}, win);
			} else {
				showWindow();
			}

			logDiagnostic('tray.toggle.after', {}, win);
		}

		const macosMenuItems: MenuItemConstructorOptions[] = is.macos
			? [
				{
					label: 'Disable Menu Bar Mode',
					click() {
						config.set('menuBarMode', false);
						toggleMenuBarMode(win);
					},
				},
				{
					label: 'Show Dock Icon',
					type: 'checkbox',
					checked: config.get('showDockIcon'),
					click(menuItem) {
						config.set('showDockIcon', menuItem.checked);

						if (menuItem.checked) {
							app.dock.show();
						} else {
							app.dock.hide();
						}

						const dockMenuItem = contextMenu.getMenuItemById('dockMenu')!;
						dockMenuItem.visible = !menuItem.checked;
					},
				},
				{
					type: 'separator',
				},
				{
					id: 'dockMenu',
					label: 'Menu',
					visible: !config.get('showDockIcon'),
					submenu: Menu.getApplicationMenu()!,
				},
			] : [];

		contextMenu = Menu.buildFromTemplate([
			{
				label: 'Toggle',
				visible: !is.macos,
				click() {
					toggleWindow();
				},
			},
			...macosMenuItems,
			{
				type: 'separator',
			},
			{
				role: 'quit',
			},
		]);

		tray = new Tray(getIconPath(false));
		logDiagnostic('tray.create.created', {}, win);

		tray.setContextMenu(contextMenu);

		updateToolTip(0);

		const trayClickHandler = (): void => {
			logDiagnostic('tray.click-handler', {}, win);

			if (!win.isFullScreen()) {
				toggleWindow();
			}
		};

		tray.on('click', () => {
			logDiagnostic('tray.event.click', {}, win);
			trayClickHandler();
		});
		tray.on('double-click', () => {
			logDiagnostic('tray.event.double-click', {}, win);
			showWindow();
		});
		tray.on('right-click', () => {
			logDiagnostic('tray.event.right-click', {}, win);
			tray?.popUpContextMenu(contextMenu);
		});
	},

	destroy() {
		logDiagnostic('tray.destroy.requested');

		// Workaround for https://github.com/electron/electron/issues/14036
		setTimeout(() => {
			tray?.destroy();
			tray = undefined;
			logDiagnostic('tray.destroy.completed');
		}, 500);
	},

	update(messageCount: number, iconData?: string, isOnline = true) {
		if (!tray) {
			return;
		}

		const shouldShowUnread = isOnline && messageCount > 0;
		const stateUnchanged = isOnline === previousIsOnline && messageCount === previousMessageCount;

		const currentHasUnread = previousMessageCount > 0;
		if (shouldShowUnread === currentHasUnread && stateUnchanged) {
			return;
		}

		previousMessageCount = messageCount;
		previousIsOnline = isOnline;
		currentIconData = iconData;
		setTrayImage(iconData, shouldShowUnread, isOnline);
		updateToolTip(messageCount, isOnline);
	},

	setBadge(shouldDisplayUnread: boolean) {
		if (is.macos || !tray) {
			return;
		}

		if (currentIconData !== undefined || shouldDisplayUnread === previousBadgeState) {
			return;
		}

		previousBadgeState = shouldDisplayUnread;
		tray.setImage(getIconPath(shouldDisplayUnread, true));
	},
};

function setTrayImage(iconData: string | undefined, hasUnreadMessages: boolean, isOnline: boolean): void {
	if (!tray) {
		return;
	}

	tray.setImage(iconData ? nativeImage.createFromDataURL(iconData) : getIconPath(hasUnreadMessages, isOnline));
}

function updateToolTip(counter: number, isOnline = true): void {
	if (!tray) {
		return;
	}

	let tooltip = app.name;

	if (!isOnline) {
		tray.setToolTip(`${tooltip} - Offline`);
		return;
	}

	if (counter > 0) {
		tooltip += `- ${counter} unread ${counter === 1 ? 'message' : 'messages'}`;
	}

	tray.setToolTip(tooltip);
}

function getIconPath(hasUnreadMessages: boolean, isOnline = true): string {
	const icon = is.macos
		? getMacOSIconName(hasUnreadMessages)
		: getNonMacOSIconName(hasUnreadMessages, isOnline);

	return path.join(__dirname, '..', `static/${icon}`);
}

function getNonMacOSIconName(hasUnreadMessages: boolean, isOnline: boolean): string {
	if (!isOnline) {
		return 'IconTrayOffline.png';
	}

	return hasUnreadMessages ? 'IconTrayUnread.png' : 'IconTray.png';
}

function getMacOSIconName(hasUnreadMessages: boolean): string {
	return hasUnreadMessages ? 'IconMenuBarUnreadTemplate.png' : 'IconMenuBarTemplate.png';
}

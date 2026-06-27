import {
	app,
	BrowserWindow,
	dialog,
	Menu,
} from 'electron';
import {ipcMain} from 'electron-better-ipc';
import {is} from 'electron-util';
import config from './config';
import tray from './tray';

export function getWindow(): BrowserWindow {
	const [win] = BrowserWindow.getAllWindows();
	return win;
}

export function sendAction<T>(action: string, arguments_?: T): void {
	const win = getWindow();

	if ((is.macos || is.windows) && win.isMinimized()) {
		win.restore();
	}

	ipcMain.callRenderer(win, action, arguments_);
}

export async function sendBackgroundAction<T, ReturnValue>(action: string, arguments_?: T): Promise<ReturnValue> {
	return ipcMain.callRenderer<T, ReturnValue>(getWindow(), action, arguments_);
}

export function showAndFocusWindow(win: BrowserWindow): void {
	if (!win || win.isDestroyed()) {
		return;
	}

	if (win.isMinimized()) {
		win.restore();
	}

	if (!win.isVisible()) {
		win.show();
	}

	if (is.windows) {
		win.show();
		win.setAlwaysOnTop(true);
		win.moveTop();
		win.focus();
		app.focus();

		setTimeout(() => {
			if (win.isDestroyed()) {
				return;
			}

			win.setAlwaysOnTop(config.get('alwaysOnTop'));
			win.focus();
			app.focus();
		}, 100);

		return;
	}

	app.focus({steal: true});
	win.focus();
}

export function showRestartDialog(message: string): void {
	const buttonIndex = dialog.showMessageBoxSync(
		getWindow(),
		{
			message,
			detail: 'Do you want to restart the app now?',
			buttons: [
				'Restart',
				'Ignore',
			],
			defaultId: 0,
			cancelId: 1,
		},
	);

	if (buttonIndex === 0) {
		app.relaunch();
		app.quit();
	}
}

export const messengerDomain = 'facebook.com';

export function stripTrackingFromUrl(url: string): string {
	const trackingUrlPrefix = `https://l.${messengerDomain}/l.php`;
	if (url.startsWith(trackingUrlPrefix)) {
		url = new URL(url).searchParams.get('u')!;
	}

	return url;
}

export const toggleTrayIcon = (): void => {
	const showTrayIconState = config.get('showTrayIcon');
	config.set('showTrayIcon', !showTrayIconState);

	if (showTrayIconState) {
		tray.destroy();
	} else {
		tray.create(getWindow());
	}
};

export const setTaskbarIconVisibility = (visible: boolean): void => {
	config.set('showTaskbarIcon', visible);
	getWindow().setSkipTaskbar(!visible);

	if (!visible && !config.get('showTrayIcon')) {
		toggleTrayIcon();
	}
};

export const toggleLaunchMinimized = (menu: Menu): void => {
	config.set('launchMinimized', !config.get('launchMinimized'));
	const loginItemSettings = app.getLoginItemSettings();
	const showTrayIconItem = menu.getMenuItemById('showTrayIcon')!;

	if (loginItemSettings.openAtLogin) {
		app.setLoginItemSettings({
			openAtLogin: true,
			openAsHidden: config.get('launchMinimized'),
		});
	}

	if (config.get('launchMinimized')) {
		if (!config.get('showTrayIcon')) {
			toggleTrayIcon();
		}

		disableMenuItem(showTrayIconItem, true);
	} else {
		showTrayIconItem.enabled = !config.get('hideWindowOnMinimize') && !config.get('hideWindowOnBlur');
	}
};

export const toggleHideWindowOnMinimize = (menu: Menu): void => {
	config.set('hideWindowOnMinimize', !config.get('hideWindowOnMinimize'));
	const showTrayIconItem = menu.getMenuItemById('showTrayIcon')!;

	if (config.get('hideWindowOnMinimize')) {
		if (!config.get('showTrayIcon')) {
			toggleTrayIcon();
		}

		disableMenuItem(showTrayIconItem, true);
	} else {
		showTrayIconItem.enabled = !config.get('launchMinimized') && !config.get('hideWindowOnBlur');
	}
};

export const toggleHideWindowOnBlur = (menu: Menu): void => {
	config.set('hideWindowOnBlur', !config.get('hideWindowOnBlur'));
	const showTrayIconItem = menu.getMenuItemById('showTrayIcon')!;

	if (config.get('hideWindowOnBlur')) {
		if (!config.get('showTrayIcon')) {
			toggleTrayIcon();
		}

		disableMenuItem(showTrayIconItem, true);
	} else {
		showTrayIconItem.enabled = !config.get('launchMinimized') && !config.get('hideWindowOnMinimize');
	}
};

const disableMenuItem = (menuItem: Electron.MenuItem, checked: boolean): void => {
	menuItem.enabled = false;
	menuItem.checked = checked;
};

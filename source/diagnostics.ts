import {appendFileSync, mkdirSync} from 'node:fs';
import path from 'node:path';
import {app, BrowserWindow} from 'electron';

type WindowState = {
	isVisible: boolean;
	isMinimized: boolean;
	isFocused: boolean;
	isDestroyed: boolean;
};

function getWindowState(win?: BrowserWindow): WindowState | undefined {
	if (!win) {
		return;
	}

	return {
		isVisible: win.isVisible(),
		isMinimized: win.isMinimized(),
		isFocused: win.isFocused(),
		isDestroyed: win.isDestroyed(),
	};
}

export function logDiagnostic(event: string, details: Record<string, unknown> = {}, win?: BrowserWindow): void {
	const logDirectory = app.getPath('userData');
	const logPath = path.join(logDirectory, 'caprine-diagnostics.log');
	const line = JSON.stringify({
		timestamp: new Date().toISOString(),
		event,
		...details,
		window: getWindowState(win),
	});

	try {
		mkdirSync(logDirectory, {recursive: true});
		appendFileSync(logPath, line + '\n');
		console.log('[caprine-diagnostics]', line);
	} catch (error) {
		console.error('[caprine-diagnostics] failed to write log', error);
	}
}

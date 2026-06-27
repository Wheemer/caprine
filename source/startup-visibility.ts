let userRequestedWindowOpen = false;
let windowHiddenByBlurAt = 0;

export function markUserRequestedWindowOpen(): void {
	userRequestedWindowOpen = true;
}

export function wasWindowOpenRequestedByUser(): boolean {
	return userRequestedWindowOpen;
}

export function markWindowHiddenByBlur(): void {
	windowHiddenByBlurAt = Date.now();
}

export function wasWindowJustHiddenByBlur(): boolean {
	return Date.now() - windowHiddenByBlurAt < 750;
}

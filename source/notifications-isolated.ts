((window, notification) => {
	const augmentedNotification = Object.assign(
		class {
			// Block Facebook page notifications; Caprine sends message notifications separately.
			// No-op, but Messenger expects this method to be present
			close(): void {} // eslint-disable-line @typescript-eslint/no-empty-function
		},
		notification,
	);

	Object.assign(window, {notification: augmentedNotification});
})(window, Notification);

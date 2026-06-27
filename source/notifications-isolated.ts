((window, notification) => {
	const bridgeState = window as typeof window & {
		__caprineNotificationBridgeInstalled?: boolean;
	};

	if (bridgeState.__caprineNotificationBridgeInstalled) {
		return;
	}

	bridgeState.__caprineNotificationBridgeInstalled = true;

	const notifications = new Map<number, Notification>();

	function notificationText(value: any): string {
		const properties = value?.props;
		return String(properties ? properties.content?.[0] : value ?? '');
	}

	function forwardNotification(title: string, options: NotificationOptions = {}): number {
		const id = counter++;
		const targetWindow = window.top ?? window;

		targetWindow.postMessage(
			{
				type: 'notification',
				data: {
					title: notificationText(title),
					id,
					...options,
					body: notificationText(options.body),
				},
			},
			'*',
		);

		return id;
	}

	window.addEventListener('message', ({data: {type, data}}) => {
		if (type === 'notification-callback') {
			const {callbackName, id}: NotificationCallback = data;
			const notification = notifications.get(id);

			if (!notification) {
				return;
			}

			if (notification[callbackName]) {
				notification[callbackName]();
			}

			if (callbackName === 'onclose') {
				notifications.delete(id);
			}
		}

		if (type === 'notification-reply-callback') {
			const {callbackName, id, previousConversation, reply}: NotificationReplyCallback = data;
			const notification = notifications.get(id);

			if (!notification) {
				return;
			}

			if (notification[callbackName]) {
				notification[callbackName]();
			}

			notifications.delete(id);
			window.postMessage({type: 'notification-reply', data: {previousConversation, reply}}, '*');
		}
	});

	let counter = 1;

	class AugmentedNotification {
		private readonly _id: number;

		constructor(title: string, options: NotificationOptions = {}) {
			this._id = forwardNotification(title, options);
			notifications.set(this._id, this as any);
		}

		close(): void {} // eslint-disable-line @typescript-eslint/no-empty-function
	}

	Object.setPrototypeOf(AugmentedNotification, notification);

	Object.assign(window, {
		Notification: AugmentedNotification,
		notification: AugmentedNotification,
	});
})(window, Notification);

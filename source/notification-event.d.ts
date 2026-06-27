type NotificationEvent = {
	id: number;
	href?: string;
	title: string;
	body: string;
	icon: string;
	silent: boolean;
};

type TrayIconState = {
	messageCount: number;
	isOnline: boolean;
	badgePulse?: number;
};

type RenderedTrayIcon = {
	data: string;
	text: string;
};

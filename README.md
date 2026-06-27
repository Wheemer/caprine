<div align="center">
	<br>
	<br>
	<a href="https://github.com/Wheemer/caprine">
		<img src="media/AppIcon-readme.png" width="200" height="200">
	</a>
	<h1>Caprine</h1>
	<p>
		<b>A focused Facebook Messenger desktop app for Windows.</b>
	</p>
	<br>
	<p>
		Caprine is an unofficial Facebook Messenger desktop app with tray support,
		desktop notifications, unread badges, custom text sizing, and privacy controls.
	</p>
	<br>
	<a href="https://github.com/Wheemer/caprine/releases/latest">
		<img src="media/screenshot.png" width="846">
	</a>
</div>

## Install

Download the latest Windows installer from the
[GitHub Releases page](https://github.com/Wheemer/caprine/releases/latest).

Caprine installs as a normal Windows desktop app and can run from the system tray.

## Highlights

- Facebook Messenger in a dedicated desktop app
- System tray support
- Optional taskbar icon
- Unread tray badge and titlebar count
- Caprine-style desktop notifications
- Notification click-to-focus behavior
- Custom text size
- Dark theme
- Emoji style setting
- Privacy controls for seen receipts, typing indicators, and delivery receipts

## Development

Install dependencies:

```sh
npm ci
```

Run the app locally:

```sh
npm start
```

Run checks:

```sh
npm test
```

Build the Windows installer:

```sh
npm run dist:win
```

Unsigned local Windows builds can be created with:

```powershell
$env:CSC_IDENTITY_AUTO_DISCOVERY='false'
npx electron-builder --win nsis --x64 --publish never --config.win.signAndEditExecutable=false --config.nsis.packElevateHelper=false
```

## Release

Windows auto-updates are served from GitHub Releases in this repository. A release
needs a higher app version than the installed copy and must include the generated
Electron Builder update metadata.

## Attribution

Caprine was originally created by Sindre Sorhus and contributors. This repository
continues from that work under the MIT license.

## License

MIT

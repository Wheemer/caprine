<div align="center">

<h1>
  <img src="static/IconAppBlue.png" width="72" alt="Caprine icon" align="center">
  Caprine
</h1>

### Focused Facebook Messenger desktop app for Windows

[![Latest release](https://img.shields.io/github/v/release/Wheemer/caprine?style=for-the-badge&logo=github&logoColor=white&label=RELEASE&labelColor=555555&color=22C55E)](https://github.com/Wheemer/caprine/releases/latest)
[![Windows x64](https://img.shields.io/badge/WINDOWS-x64-0078D4?style=for-the-badge&logo=windows&logoColor=white&labelColor=555555)](https://github.com/Wheemer/caprine/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/Wheemer/caprine/total?style=for-the-badge&logo=github&logoColor=white&label=DOWNLOADS&labelColor=555555&color=8A2BE2)](https://github.com/Wheemer/caprine/releases)
[![License: MIT](https://img.shields.io/badge/LICENSE-MIT-64748B?style=for-the-badge&labelColor=555555)](LICENSE)

</div>

Caprine is an unofficial Facebook Messenger desktop app. This fork is maintained
as a Windows x64 build with cleaner desktop behavior, tray support, unread
badges, and updated app branding.

This is not affiliated with Meta or Facebook.

## Install

Download the latest Windows x64 installer from the
[GitHub Releases page](https://github.com/Wheemer/caprine/releases/latest).

Caprine installs as a normal Windows desktop app and supports auto-updates from
this repository.

## What's Different Here

- Windows x64 releases only
- Updated Caprine app, splash, tray, and taskbar icons
- System tray unread count with a breathing badge
- Offline tray icon state
- Custom Messenger notifications with click-to-focus behavior
- Fixed notification sound playback
- Frameless Windows window with custom controls and Alt menu support
- Tray and taskbar behavior options
- Hide-on-minimize and hide-on-focus-loss options
- Image viewer zoom and pan improvements

## Development

Install dependencies and run checks:

```sh
npm ci
npm test
```

Build an unsigned local Windows x64 installer:

```powershell
$env:CSC_IDENTITY_AUTO_DISCOVERY='false'
npx electron-builder --win nsis --x64 --publish never --config.win.signAndEditExecutable=false --config.nsis.packElevateHelper=false
```

## Attribution

Caprine was originally created by Sindre Sorhus and contributors. This fork
continues from that work under the MIT license.

## License

MIT

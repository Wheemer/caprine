$ErrorActionPreference = 'Stop'

$repo = Resolve-Path (Join-Path $PSScriptRoot '..')
$dist = Join-Path $repo 'dist'

if (Test-Path -LiteralPath $dist) {
	$resolvedDist = Resolve-Path -LiteralPath $dist
	if (-not $resolvedDist.Path.StartsWith($repo.Path, [System.StringComparison]::OrdinalIgnoreCase)) {
		throw "Refusing to remove unexpected dist path: $resolvedDist"
	}

	Remove-Item -LiteralPath $resolvedDist -Recurse -Force
}

Push-Location $repo
try {
	$env:CSC_IDENTITY_AUTO_DISCOVERY = 'false'
	npx electron-builder --win dir --x64 --publish never --config.win.signAndEditExecutable=false
	powershell -NoProfile -ExecutionPolicy Bypass -File build/stamp-windows-exe.ps1
	npx electron-builder --win nsis --x64 --prepackaged dist/win-unpacked --publish never --config.win.signAndEditExecutable=false --config.nsis.packElevateHelper=false
} finally {
	Pop-Location
}

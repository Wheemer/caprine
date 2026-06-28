$ErrorActionPreference = 'Stop'

$repo = Resolve-Path (Join-Path $PSScriptRoot '..')
$exe = Join-Path $repo 'dist\win-unpacked\Caprine.exe'
$icon = Join-Path $repo 'build\icon.ico'
$package = Get-Content -LiteralPath (Join-Path $repo 'package.json') -Raw | ConvertFrom-Json
$version = [string]$package.version

if (-not (Test-Path -LiteralPath $exe)) {
	throw "Missing Windows executable: $exe"
}

$rcedit = Get-ChildItem -Path "$env:LOCALAPPDATA\electron-builder\Cache\winCodeSign" -Recurse -Filter rcedit-x64.exe |
	Sort-Object LastWriteTime -Descending |
	Select-Object -First 1 -ExpandProperty FullName

if (-not $rcedit) {
	throw 'Could not find rcedit-x64.exe in the electron-builder cache.'
}

$arguments = @(
	$exe,
	'--set-version-string', 'CompanyName', 'Wheemer',
	'--set-version-string', 'FileDescription', 'Caprine',
	'--set-version-string', 'ProductName', 'Caprine',
	'--set-version-string', 'InternalName', 'Caprine',
	'--set-version-string', 'OriginalFilename', 'Caprine.exe',
	'--set-version-string', 'LegalCopyright', 'Copyright Wheemer and Caprine contributors',
	'--set-file-version', $version,
	'--set-product-version', $version
)

if (Test-Path -LiteralPath $icon) {
	$arguments += @('--set-icon', $icon)
}

& $rcedit @arguments

$file = Get-Item -LiteralPath $exe
$file.VersionInfo |
	Select-Object ProductName, FileDescription, CompanyName, InternalName, OriginalFilename, FileVersion, ProductVersion |
	Format-List

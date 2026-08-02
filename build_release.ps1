$wailsJson = Get-Content "wails.json" | ConvertFrom-Json
$version = $wailsJson.info.productVersion

Write-Host "Start AetherSSH packaging process: V$version" -ForegroundColor Cyan

$basePath = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$exePath = "$basePath\GO\exe"
$portablePath = "$basePath\GO\Portable"
$nsisPath = "$basePath\GO\Packaging_Tools\nsis\nsis-3.08"
$goPath = "$basePath\GO\go\bin"

if (!(Test-Path $exePath)) { New-Item -ItemType Directory -Path $exePath | Out-Null }
if (!(Test-Path $portablePath)) { New-Item -ItemType Directory -Path $portablePath | Out-Null }

# Sync wails.json version to config.js
$configPath = "frontend\src\config.js"
if (Test-Path $configPath) {
    $configContent = Get-Content $configPath -Raw
    $configContent = $configContent -replace "APP_VERSION = '.*?';", "APP_VERSION = '$version';"
    Set-Content -Path $configPath -Value $configContent
    Write-Host "Synced version $version to frontend config.js" -ForegroundColor Green
}

# Inject required paths（含 wails CLI 所在目录 %USERPROFILE%\go\bin）
$env:PATH = "$goPath;$nsisPath;$env:USERPROFILE\go\bin;" + $env:PATH

Write-Host "`n[1/2] Compiling Portable Edition..." -ForegroundColor Yellow
wails build -clean -upx
if ($LASTEXITCODE -ne 0) { Write-Error "Portable build failed"; exit 1 }

$portableDest = "$portablePath\Aether_Portable_V$version.exe"
Write-Host "Output portable to: $portableDest" -ForegroundColor Green
Copy-Item -Path "build\bin\Aether.exe" -Destination $portableDest -Force

Write-Host "`n[2/2] Compiling Setup Edition..." -ForegroundColor Yellow
wails build -clean -nsis -upx
if ($LASTEXITCODE -ne 0) { Write-Error "Setup build failed"; exit 1 }

$setupDest = "$exePath\Aether_Setup_V$version.exe"
Write-Host "Output setup to: $setupDest" -ForegroundColor Green
Copy-Item -Path "build\bin\Aether-amd64-installer.exe" -Destination $setupDest -Force

Write-Host "`nPackaging completed successfully!" -ForegroundColor Cyan

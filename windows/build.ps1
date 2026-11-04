# 在 Windows 上构建桌面天气（需要 .NET 8 SDK）
# 运行:  powershell -ExecutionPolicy Bypass -File build.ps1
# 产物:  windows\publish\DesktopWeather.exe（app/ 目录需随 exe 一起分发）
$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

dotnet publish -c Release -r win-x64 -o publish

# 把共享 Web 核心复制到发布目录
if (Test-Path publish\app) { Remove-Item -Recurse -Force publish\app }
Copy-Item -Recurse ..\app publish\app

Write-Host "构建完成: $PWD\publish\DesktopWeather.exe"
Write-Host "注意: 目标机器需安装 WebView2 Runtime（Win10/11 一般已内置）"

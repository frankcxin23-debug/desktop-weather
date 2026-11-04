#!/bin/bash
# 构建 macOS 版 桌面天气.app（共享 Web 核心 + Swift/WKWebView 壳）
set -euo pipefail
cd "$(dirname "$0")"

echo "编译 macOS 壳…"
(cd macos && swift build -c release)

APP="build/桌面天气.app"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp macos/.build/release/DesktopWeather "$APP/Contents/MacOS/DesktopWeather"
cp macos/Info.plist "$APP/Contents/Info.plist"
cp -R app "$APP/Contents/Resources/app"
codesign --force --sign - "$APP"

echo "构建完成：$PWD/$APP"
echo "运行：open \"$PWD/$APP\""
echo "Windows 版：在 Windows 上运行 windows/build.ps1（需 .NET 8 SDK）"

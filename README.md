# 桌面天气 Desktop Weather

把当地天气变成电脑桌面的"氛围"。不是在桌面上贴一个天气小组件，而是让整个桌面随天气流动变化——雨天整体转阴暗冷调、雨丝斜落、水珠沿屏幕滑落；雪天漫天飘雪；晴天泛暖金光晕、夜晚是闪烁星空。

铺满桌面但完全不挡鼠标和窗口（壁纸之上、所有窗口之下）。

## 效果一览

| 天气 | 桌面效果 |
|------|----------|
| 晴天（白天） | 暖金色太阳辉光 + 缓缓上浮的光尘 |
| 晴夜 | 深蓝夜空 + 冷暖双色闪烁星空 + 月光晕 |
| 多云 | 半透明流云缓缓漂移 |
| 阴天 | 厚重灰云层铺满 |
| 雾 | 乳白雾带弥漫流动 |
| 小雨 | 冷灰色调 + 细雨丝 + 偶尔玻璃水珠 |
| 大雨 | 钢青深蓝调 + 三层景深雨 + 水珠滑落 |
| 雷雨 | 深墨色调 + 密集雨 + 随机闪电 |
| 雪天 | 冷蓝紫调 + 双层景深飘雪 |

调色均为昼/夜两套精细渐变（共 14 套），天气切换时色调交叉淡入淡出。

## 功能

- **自动定位**：macOS 走系统定位（CoreLocation，需授权），失败自动回退 IP 定位；Windows 走 IP 定位
- **手动选城市**：即搜即得（支持中文/英文）+ 12 个热门城市一键切换
- **特效强度**：20% ~ 180% 滑块，实时生效，自动保存
- 每 30 分钟自动刷新天气，系统唤醒后立即刷新

## 试一试（无需构建）

特效核心是纯 HTML/Canvas，浏览器直接打开即可预览：

```
app/index.html?demo=rain-night    # 指定某种天气
app/index.html?demo=auto          # 每 8 秒轮播全部天气
```

支持：`clear-day` `clear-night` `partly-day` `partly-night` `overcast-day` `overcast-night` `fog` `drizzle-day` `drizzle-night` `rain-day` `rain-night` `thunder-day` `thunder-night` `snow-day` `snow-night`

## 构建

### macOS（需要 Xcode Command Line Tools）

```bash
./build.sh
open build/桌面天气.app
```

首次运行会弹出定位权限，允许后即可显示当地天气氛围。

### Windows（需要 .NET 8 SDK，目标机器需 WebView2 Runtime，Win10/11 一般已内置）

```powershell
powershell -ExecutionPolicy Bypass -File windows\build.ps1
# 产物：windows\publish\DesktopWeather.exe
```

窗口会嵌入桌面壁纸层（WorkerW 技术，与 Wallpaper Engine 同款方案）。

## 架构

```
app/            共享 Web 核心（两平台通用）
├── js/fx.js        Canvas 2D 特效引擎（粒子/云/辉光/暗角/闪电）
├── js/palette.js   14 套昼/夜精细调色板
├── js/weather.js   Open-Meteo 天气 + 城市搜索 + IP 定位兜底
├── settings.html   设置页（城市选择 + 强度滑块）
└── js/bridge.js    页面 ↔ 原生壳桥接

macos/          Swift 壳：WKWebView 挂 kCGDesktopWindowLevel 桌面层
windows/        C# 壳：WebView2 嵌入 WorkerW 桌面壁纸层
```

两平台壳与页面之间使用同一套桥接协议（`DW.initB64` / `DW.applySettingsB64` / `DW.setCoordsB64`，base64 JSON 传参）。

## 数据与隐私

- 天气与地理编码：[Open-Meteo](https://open-meteo.com)（免费、无需 API Key）
- IP 定位兜底：ipapi.co / ipwho.is
- 位置信息仅用于获取天气数据，不做任何其他用途；设置只保存在本机

## License

[MIT](LICENSE)

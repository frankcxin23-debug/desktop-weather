# Desktop Weather

Turn your local weather into your desktop's *mood*. Not a widget pinned on the wallpaper — the entire desktop comes alive and flows with the weather: rainy days shift the whole screen into a dark, cold palette with slanted rain streaks and droplets sliding down the glass; snow days bring drifting snowfall; sunny days glow with warm golden light, and clear nights fill the sky with twinkling stars.

It covers the full screen yet never blocks your mouse or windows (above the wallpaper, below everything else).

## Effects

| Weather | Desktop Effect |
|---------|----------------|
| Clear (day) | Warm golden sun glow + slowly rising light dust |
| Clear night | Deep blue sky + dual-tone twinkling stars + moon glow |
| Partly cloudy | Translucent clouds drifting slowly |
| Overcast | Heavy gray cloud layers |
| Fog | Milky fog banks rolling through |
| Light rain | Cold gray tone + fine rain streaks + occasional glass droplets |
| Heavy rain | Steel-blue tone + 3-layer depth rain + droplets sliding down |
| Thunderstorm | Ink-dark tone + dense rain + random lightning |
| Snow | Cold blue-violet tone + 2-layer depth snowfall |

Each weather condition ships with finely tuned day/night gradient palettes (14 in total), cross-fading smoothly when conditions change.

## Features

- **Auto location**: system location on macOS (CoreLocation, with permission prompt), IP-based fallback; IP-based location on Windows
- **Manual city picker**: instant search-as-you-type (Chinese/English) + 12 popular cities one click away
- **Intensity slider**: 20% – 180%, applies in real time, auto-saved
- Weather auto-refreshes every 30 minutes, and instantly on system wake

## Try It (No Build Required)

The effects engine is plain HTML/Canvas — open it directly in a browser:

```
app/index.html?demo=rain-night    # a specific condition
app/index.html?demo=auto          # cycle through all conditions every 8s
```

Supported: `clear-day` `clear-night` `partly-day` `partly-night` `overcast-day` `overcast-night` `fog` `drizzle-day` `drizzle-night` `rain-day` `rain-night` `thunder-day` `thunder-night` `snow-day` `snow-night`

## Build

### macOS (requires Xcode Command Line Tools)

```bash
./build.sh
open build/桌面天气.app
```

The first launch asks for location permission — allow it and your local weather mood appears.

### Windows (requires .NET 8 SDK; WebView2 Runtime on the target machine, built into Win10/11)

```powershell
powershell -ExecutionPolicy Bypass -File windows\build.ps1
# Output: windows\publish\DesktopWeather.exe
```

The window is embedded into the desktop wallpaper layer (WorkerW technique, same approach as Wallpaper Engine).

## Architecture

```
app/            Shared web core (works on both platforms)
├── js/fx.js        Canvas 2D effects engine (particles / clouds / glow / vignette / lightning)
├── js/palette.js   14 fine-tuned day/night palettes
├── js/weather.js   Open-Meteo weather + city search + IP location fallback
├── settings.html   Settings page (city picker + intensity slider)
└── js/bridge.js    Bridge between the page and native shells

macos/          Swift shell: WKWebView pinned to the kCGDesktopWindowLevel desktop layer
windows/        C# shell: WebView2 embedded in the WorkerW wallpaper layer
```

Both shells talk to the page through the same bridge protocol (`DW.initB64` / `DW.applySettingsB64` / `DW.setCoordsB64`, base64 JSON payloads).

## Data & Privacy

- Weather & geocoding: [Open-Meteo](https://open-meteo.com) (free, no API key)
- IP location fallback: ipapi.co / ipwho.is
- Your location is used solely to fetch weather data — nothing else. Settings stay on your machine.

## License

[MIT](LICENSE)

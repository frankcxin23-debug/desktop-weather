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
- **Manual city picker**: instant search-as-you-type (Chinese/English) + 12 popular cities one click away + world map
- **Intensity slider**: 20% – 180%, applies in real time, auto-saved
- **Background music plugin**: weather-mood, region-aware ambient mix (see below)
- Weather auto-refreshes every 30 minutes, and instantly on system wake; offline it falls back to the last known city

## Background Music (Plugin)

An optional music plugin, **enabled by default after install**. It reads the local weather mood and the region/language you're in, then plays a quiet background mix that matches the sky: low-key, bass-heavy ballads on gloomy rainy days; bright, upbeat pop on sunny ones. Tracks cross-fade at a low ambient volume and are shown in the menu bar / tray, where you can pause or skip.

You decide *when* it plays — always, manually started, only on certain weather, or only in certain cities. Multi-monitor setups play audio on the main display only.

### Free vs Paid

| | **Free (default)** | **Paid (bring your own API)** |
|---|---|---|
| Cost | $0, nothing to sign up | Any Spotify API costs are **paid by you, to Spotify** — this app is free and never charges you |
| Song selection | iTunes public charts + mood keyword search | Spotify's search/recommendation catalog for finer mood matching |
| Playback | Official 30-second previews, seamless mix | Same 30-second previews (see note below) |
| Setup | None — works out of the box | Create your own free Spotify developer app and paste its Client ID + Secret in Settings |
| If credentials fail | — | Silently falls back to the free iTunes source |

**Why does the paid tier still play 30-second previews?** Full-track streaming is locked behind Spotify Premium + OAuth (Web Playback SDK) or a licensed Apple Music MusicKit token. Additionally, Spotify no longer returns preview URLs to newly registered apps. So the paid tier uses your Spotify credentials purely to **pick better-fitting songs**, then resolves an official playable preview via iTunes. Native full-song playback for Premium users is on the roadmap.

### Configure the paid tier (optional)

1. Create an app in the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) (free; you own the app and agree to Spotify's terms — quota/fees, if any, are between you and Spotify).
2. In Desktop Weather → Settings → Background Music → *Selection service*, choose **Spotify** and paste your Client ID + Client Secret.
3. Done. Invalid or exhausted credentials simply fall back to the free source.

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
- Music previews: [Apple iTunes public API](https://itunes.apple.com) (free, no key); optional mood matching via [Spotify Web API](https://developer.spotify.com) using credentials you provide
- Your location is used solely to fetch weather/music data — nothing else. Settings (including your Spotify credentials) stay on your machine and are only sent to the respective API.

## License

[MIT](LICENSE)

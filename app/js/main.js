// 特效页主控：接收设置 → 定位 → 拉取天气 → 驱动 FX
'use strict';
const App = {
  settings: { intensity: 1, useManualCity: false, cityName: '', lat: null, lon: null },
  coords: null,
  lastW: { condition: 'clear', isDay: true },
  locTimer: null,
  refreshTimer: null,
  started: false,

  init(cfg) {
    Object.assign(this.settings, cfg || {});
    this.pushState();
    this.start();
  },

  applySettings(cfg) {
    const prevManual = this.settings.useManualCity;
    const prevLat = this.settings.lat;
    Object.assign(this.settings, cfg || {});
    this.pushState();
    const cityChanged = this.settings.useManualCity &&
      (!prevManual || prevLat !== this.settings.lat);
    if (this.settings.useManualCity && this.settings.lat != null) {
      if (cityChanged) {
        this.coords = { lat: this.settings.lat, lon: this.settings.lon, city: this.settings.cityName };
        this.fetchWeather();
      }
    } else if (prevManual || !this.started) {
      this.waitShellLocation();
    }
  },

  pushState() {
    const p = {
      condition: this.lastW.condition, isDay: this.lastW.isDay,
      intensity: this.settings.intensity
    };
    if (this.lastW.env) p.env = this.lastW.env; // demo 模式无 env,保留 FX 默认值
    FX.setState(p);
  },

  start() {
    // 演示模式：?demo=rain / thunder-night / auto
    const demo = new URLSearchParams(location.search).get('demo');
    if (demo) { this.runDemo(demo); return; }
    this.started = true;
    if (this.settings.useManualCity && this.settings.lat != null) {
      this.coords = { lat: this.settings.lat, lon: this.settings.lon, city: this.settings.cityName };
      this.fetchWeather();
    } else {
      this.waitShellLocation();
    }
  },

  // 等待原生壳推送精确定位；8 秒未到则 IP 定位
  waitShellLocation() {
    clearTimeout(this.locTimer);
    this.locTimer = setTimeout(() => this.ipLocate(), 8000);
  },

  setCoords(lat, lon, city) {
    clearTimeout(this.locTimer);
    this.coords = { lat, lon, city };
    this.started = true;
    this.fetchWeather();
  },

  noShellLocation() {
    clearTimeout(this.locTimer);
    this.ipLocate();
  },

  async ipLocate() {
    const loc = await Weather.ipLocation();
    this.setCoords(loc.lat, loc.lon, loc.city);
  },

  async fetchWeather() {
    if (!this.coords) return;
    try {
      const w = await Weather.fetch(this.coords.lat, this.coords.lon);
      this.lastW = { condition: w.condition, isDay: w.isDay, env: w.env };
      this.pushState();
    } catch (e) {
      // 失败时保持当前效果，稍后重试
    }
    clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => this.fetchWeather(), 30 * 60 * 1000);
  },

  refresh() { this.fetchWeather(); },

  runDemo(mode) {
    const order = ['clear-day', 'partly-day', 'overcast-day', 'fog', 'drizzle-day',
      'rain-day', 'thunder-night', 'snow-day', 'clear-night', 'rain-night', 'snow-night'];
    const apply = k => {
      const [c, d] = k.split('-');
      this.lastW = { condition: c, isDay: d === 'day' };
      this.pushState();
    };
    if (mode === 'auto') {
      let i = 0;
      apply(order[0]);
      setInterval(() => { i = (i + 1) % order.length; apply(order[i]); }, 8000);
    } else if (PALETTES[mode]) {
      apply(mode);
    }
  }
};

// 原生壳调用入口（参数为 base64(JSON)）
window.DW = {
  initB64(b64) { App.init(DWUtil.parse(b64)); },
  applySettingsB64(b64) { App.applySettings(DWUtil.parse(b64)); },
  setCoordsB64(b64) { const o = DWUtil.parse(b64); App.setCoords(o.lat, o.lon, o.city || ''); },
  noShellLocation() { App.noShellLocation(); },
  refresh() { App.refresh(); }
};

// 浏览器直开预览：无原生壳时也能演示（?demo=rain / thunder-night / auto）
const _demo = new URLSearchParams(location.search).get('demo');
if (_demo) App.runDemo(_demo);

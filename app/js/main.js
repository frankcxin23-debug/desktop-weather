// 特效页主控：接收设置 → 定位 → 拉取天气 → 驱动 FX
'use strict';
// 副屏静音（壳为第二块及以后的屏幕加载 index.html?nosound=1）
window.MUSIC_MUTED = new URLSearchParams(location.search).get('nosound') === '1';
const App = {
  settings: { intensity: 1, useManualCity: false, cityName: '', lat: null, lon: null },
  coords: null,
  lastW: { condition: 'clear', isDay: true },
  locTimer: null,
  refreshTimer: null,
  started: false,

  init(cfg) {
    Object.assign(this.settings, cfg || {});
    Music.applyConfig(cfg && cfg.music);
    this.pushState();
    this.start();
  },

  applySettings(cfg) {
    const prevManual = this.settings.useManualCity;
    const prevLat = this.settings.lat;
    Object.assign(this.settings, cfg || {});
    Music.applyConfig(cfg && cfg.music);
    this.pushState();
    const cityChanged = this.settings.useManualCity &&
      (!prevManual || prevLat !== this.settings.lat);
    if (this.settings.useManualCity && this.settings.lat != null) {
      if (cityChanged) {
        this.coords = { lat: this.settings.lat, lon: this.settings.lon, city: this.settings.cityName, country: this.settings.country || '' };
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

  setCoords(lat, lon, city, country) {
    clearTimeout(this.locTimer);
    this.coords = { lat, lon, city, country: country || (this.coords && this.coords.country) || '' };
    this.started = true;
    // 缓存定位结果：断网时下次启动直接使用上次城市
    try { localStorage.setItem('dw.lastLoc', JSON.stringify({ lat, lon, city, country: this.coords.country, t: Date.now() })); } catch (e) {}
    this.fetchWeather();
  },

  noShellLocation() {
    clearTimeout(this.locTimer);
    this.ipLocate();
  },

  readCachedLoc() {
    try {
      const o = JSON.parse(localStorage.getItem('dw.lastLoc') || 'null');
      if (o && typeof o.lat === 'number' && typeof o.lon === 'number') return o;
    } catch (e) {}
    return null;
  },

  async ipLocate() {
    let loc = null;
    try {
      loc = await Weather.ipLocation();
    } catch (e) {
      // 断网或 IP 服务不可用：回退到上次使用的城市
      loc = this.readCachedLoc();
      if (!loc) {
        // 从未成功定位过：退回默认城市（北京）
        loc = { lat: 39.9042, lon: 116.4074, city: '北京' };
      }
    }
    this.setCoords(loc.lat, loc.lon, loc.city || '', loc.country || '');
  },

  async fetchWeather() {
    if (!this.coords) return;
    let ok = false;
    try {
      const w = await Weather.fetch(this.coords.lat, this.coords.lon);
      this.lastW = { condition: w.condition, isDay: w.isDay, env: w.env };
      this.pushState();
      // 背景音乐跟随天气与地区情绪
      Music.setWeather(w.condition, w.isDay, this.coords.city || '',
        this.coords.country || (this.settings && this.settings.country) || '');
      ok = true;
    } catch (e) {
      // 断网：保持当前效果，稍后重试
    }
    clearTimeout(this.refreshTimer);
    // 成功后 30 分钟刷新；失败（断网）60 秒后快速重试，网络恢复立即自愈
    this.refreshTimer = setTimeout(() => this.fetchWeather(), ok ? 30 * 60 * 1000 : 60 * 1000);
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
  setCoordsB64(b64) { const o = DWUtil.parse(b64); App.setCoords(o.lat, o.lon, o.city || '', o.country || ''); },
  noShellLocation() { App.noShellLocation(); },
  refresh() { App.refresh(); }
};

// 壳菜单栏 → 音乐控制
function musicToggle() { Music.toggle(); }
function musicNext() {
  if (!Music.queue.length) return;
  Music.next();
}

// 网络恢复时立即重新拉取（断网自愈）
window.addEventListener('online', () => App.refresh());

// 浏览器直开预览：无原生壳时也能演示（?demo=rain / thunder-night / auto）
const _demo = new URLSearchParams(location.search).get('demo');
if (_demo) App.runDemo(_demo);

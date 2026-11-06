// 设置页：城市选择（即搜即得 + 热门城市）与特效强度
'use strict';
const SUI = {
  s: { intensity: 1, useManualCity: false, cityName: '', lat: null, lon: null },
  popular: [
    { name: '北京', lat: 39.9042, lon: 116.4074 },
    { name: '上海', lat: 31.2304, lon: 121.4737 },
    { name: '广州', lat: 23.1291, lon: 113.2644 },
    { name: '深圳', lat: 22.5431, lon: 114.0579 },
    { name: '杭州', lat: 30.2741, lon: 120.1551 },
    { name: '成都', lat: 30.5728, lon: 104.0668 },
    { name: '重庆', lat: 29.5630, lon: 106.5516 },
    { name: '西安', lat: 34.3416, lon: 108.9398 },
    { name: '东京', lat: 35.6762, lon: 139.6503 },
    { name: '新加坡', lat: 1.3521, lon: 103.8198 },
    { name: '伦敦', lat: 51.5074, lon: -0.1278 },
    { name: '纽约', lat: 40.7128, lon: -74.0060 }
  ],
  // 地图上的全球参考城市（世界时钟风格，分布均衡避免重叠）
  worldCities: [
    { name: '东京', lat: 35.6762, lon: 139.6503 },
    { name: '新加坡', lat: 1.3521, lon: 103.8198 },
    { name: '悉尼', lat: -33.8688, lon: 151.2093 },
    { name: '迪拜', lat: 25.2048, lon: 55.2708 },
    { name: '莫斯科', lat: 55.7558, lon: 37.6173 },
    { name: '伦敦', lat: 51.5074, lon: -0.1278 },
    { name: '巴黎', lat: 48.8566, lon: 2.3522 },
    { name: '纽约', lat: 40.7128, lon: -74.0060 },
    { name: '洛杉矶', lat: 34.0522, lon: -118.2437 },
    { name: '圣保罗', lat: -23.5505, lon: -46.6333 }
  ],
  searchTimer: null,
  saveTimer: null,
  seq: 0,

  init(cfg) {
    Object.assign(this.s, cfg || {});
    this.bind();
    this.render();
    this.renderMap();
    this.refreshWx();
  },

  renderMap() {
    const manual = this.s.useManualCity && this.s.lat != null;
    const pts = this.worldCities.slice();
    if (manual && !pts.some(p => p.name === this.s.cityName)) {
      pts.push({ name: this.s.cityName, lat: this.s.lat, lon: this.s.lon });
    }
    WorldMap.render(this.$('worldmap'), pts,
      manual ? this.s.cityName : '', p => this.pick(p.name, p.lat, p.lon));
  },

  $: id => document.getElementById(id),

  bind() {
    // 分段控件
    this.$('seg').querySelectorAll('button').forEach(b => {
      b.addEventListener('click', () => {
        this.s.useManualCity = b.dataset.mode === 'manual';
        this.render();
        this.renderMap();
        this.save();
        this.refreshWx();
      });
    });

    // 即搜即得
    const q = this.$('q');
    q.addEventListener('input', () => {
      clearTimeout(this.searchTimer);
      const v = q.value.trim();
      if (!v) { this.renderResults([]); return; }
      this.searchTimer = setTimeout(() => this.doSearch(v), 280);
    });
    q.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        clearTimeout(this.searchTimer);
        const v = q.value.trim();
        if (v) this.doSearch(v);
      }
    });

    // 热门城市
    const chips = this.$('chips');
    for (const c of this.popular) {
      const el = document.createElement('div');
      el.className = 'chip';
      el.textContent = c.name;
      el.addEventListener('click', () => this.pick(c.name, c.lat, c.lon));
      chips.appendChild(el);
    }

    // 强度
    const slider = this.$('intensity');
    slider.addEventListener('input', () => {
      this.s.intensity = Number(slider.value) / 100;
      this.$('pct').textContent = slider.value + '%';
      clearTimeout(this.saveTimer);
      this.saveTimer = setTimeout(() => this.save(), 120);
    });
  },

  render() {
    // 分段
    this.$('seg').querySelectorAll('button').forEach(b => {
      b.classList.toggle('on', (b.dataset.mode === 'manual') === this.s.useManualCity);
    });
    this.$('manualArea').classList.toggle('hidden', !this.s.useManualCity);
    // 状态行
    const st = this.$('cityStatus');
    if (this.s.useManualCity && this.s.cityName) {
      st.innerHTML = `当前城市：<b>${this.s.cityName}</b>`;
    } else if (this.s.useManualCity) {
      st.textContent = '搜索或点击下方热门城市';
    } else {
      st.textContent = '将使用你所在位置获取天气';
    }
    // 强度
    this.$('intensity').value = Math.round(this.s.intensity * 100);
    this.$('pct').textContent = Math.round(this.s.intensity * 100) + '%';
    // 热门城市选中态
    this.$('chips').querySelectorAll('.chip').forEach(el => {
      el.classList.toggle('sel', this.s.useManualCity && el.textContent === this.s.cityName);
    });
  },

  async doSearch(v) {
    const seq = ++this.seq;
    this.$('spin').classList.remove('hidden');
    let list = [];
    try { list = await Weather_search(v); } catch (e) { /* 忽略 */ }
    if (seq !== this.seq) return;
    this.$('spin').classList.add('hidden');
    this.renderResults(list);
  },

  renderResults(list) {
    const box = this.$('results');
    box.innerHTML = '';
    if (!this.$('q').value.trim()) return;
    if (!list.length) {
      box.innerHTML = '<div class="empty">没有找到相关城市</div>';
      return;
    }
    for (const r of list) {
      const row = document.createElement('div');
      row.className = 'row' + (this.s.useManualCity && this.s.cityName === r.name ? ' sel' : '');
      const left = document.createElement('div');
      const nm = document.createElement('div');
      nm.className = 'name';
      nm.textContent = r.name;
      const geo = document.createElement('div');
      geo.className = 'geo';
      geo.textContent = r.display.split(' · ').slice(1).join(' · ');
      left.appendChild(nm); left.appendChild(geo);
      row.appendChild(left);
      if (this.s.useManualCity && this.s.cityName === r.name) {
        const ck = document.createElement('div');
        ck.className = 'check';
        ck.textContent = '当前';
        row.appendChild(ck);
      }
      row.addEventListener('click', () => this.pick(r.name, r.lat, r.lon));
      box.appendChild(row);
    }
  },

  pick(name, lat, lon) {
    this.s.useManualCity = true;
    this.s.cityName = name;
    this.s.lat = lat;
    this.s.lon = lon;
    this.render();
    this.renderMap();
    this.save();
    this.refreshWx();
  },

  // ---- 当前城市当日实时天气（设置页直接向 Open-Meteo 拉取）----
  wxSeq: 0,
  async refreshWx() {
    const seq = ++this.wxSeq;
    const st = this.$('cityStatus');
    if (this.s.useManualCity && this.s.lat != null) {
      this.fetchWx(seq, this.s.lat, this.s.lon, this.s.cityName);
    } else if (!this.s.useManualCity) {
      // 自动定位：设置页自行 IP 定位（系统精确定位在特效页，显示天气足够）
      st.innerHTML = '<span class="wx-loading">正在定位…</span>';
      try {
        const loc = await Weather.ipLocation();
        if (seq === this.wxSeq) this.fetchWx(seq, loc.lat, loc.lon, loc.city);
      } catch (e) {
        if (seq === this.wxSeq) st.innerHTML = '<span class="wx-loading">定位失败</span>';
      }
    }
  },

  async fetchWx(seq, lat, lon, city) {
    const st = this.$('cityStatus');
    st.innerHTML = '<span class="wx-loading">正在获取天气…</span>';
    try {
      const w = await Weather.fetch(lat, lon);
      if (seq !== this.wxSeq) return; // 已切换到别的城市，丢弃过期结果
      const e = w.env;
      st.innerHTML =
        `<div class="wx"><div class="wx-main"><b>${city || '当前位置'}</b> · ${w.desc} · ` +
        `${Math.round(w.temp)}°C${w.isDay ? '' : ' · 夜'}</div>` +
        `<div class="wx-sub">风 ${Math.round(e.wind)} km/h · 湿度 ${Math.round(e.humidity)}% · ` +
        `云量 ${Math.round(e.cloud)}% · 降水 ${e.precip} mm/h</div></div>`;
    } catch (err) {
      if (seq === this.wxSeq) st.innerHTML = '<span class="wx-loading">天气获取失败，将自动重试</span>';
    }
  },

  save() { DWUtil.save(this.s); }
};

// 内联城市搜索（与特效页共用 Open-Meteo Geocoding）
async function Weather_search(q) {
  const u = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}` +
    '&count=8&language=zh&format=json';
  const res = await fetch(u);
  if (!res.ok) return [];
  const j = await res.json();
  return (j.results || []).map(r => ({
    name: r.name,
    display: [r.name, r.admin1, r.country].filter(Boolean).join(' · '),
    lat: r.latitude,
    lon: r.longitude
  }));
}

window.DW = {
  initB64(b64) { SUI.init(DWUtil.parse(b64)); }
};

// 浏览器直开兜底：无原生壳注入时用默认配置初始化（便于预览与调试）
if (!(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.dwBridge) &&
    !(window.chrome && window.chrome.webview)) {
  SUI.init({ intensity: 1, useManualCity: false, cityName: '', lat: null, lon: null });
}

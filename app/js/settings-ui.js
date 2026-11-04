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
  searchTimer: null,
  saveTimer: null,
  seq: 0,

  init(cfg) {
    Object.assign(this.s, cfg || {});
    this.bind();
    this.render();
  },

  $: id => document.getElementById(id),

  bind() {
    // 分段控件
    this.$('seg').querySelectorAll('button').forEach(b => {
      b.addEventListener('click', () => {
        this.s.useManualCity = b.dataset.mode === 'manual';
        this.render();
        this.save();
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
    this.save();
    this.$('cityStatus').innerHTML = `已切换到 <b>${name}</b>，桌面即刻更新`;
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

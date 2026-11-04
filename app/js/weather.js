// 天气数据：Open-Meteo（免费、无需 Key、支持 CORS）
'use strict';
const Weather = {
  // WMO 天气代码 → 特效条件
  condition(code) {
    if (code === 0) return 'clear';
    if (code <= 2) return 'partly';
    if (code === 3) return 'overcast';
    if (code === 45 || code === 48) return 'fog';
    if (code >= 51 && code <= 57) return 'drizzle';
    if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
    if (code >= 95) return 'thunder';
    return 'overcast';
  },

  async fetch(lat, lon) {
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      '&current=temperature_2m,weather_code,is_day&timezone=auto';
    const res = await fetch(u);
    if (!res.ok) throw new Error('weather http ' + res.status);
    const j = await res.json();
    return {
      condition: this.condition(j.current.weather_code),
      isDay: j.current.is_day === 1,
      temp: j.current.temperature_2m
    };
  },

  // 城市搜索（Open-Meteo Geocoding，返回中文结果）
  async searchCity(q) {
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
  },

  // IP 定位兜底
  async ipLocation() {
    try {
      const r = await fetch('https://ipapi.co/json/');
      const j = await r.json();
      if (j.latitude != null) return { lat: j.latitude, lon: j.longitude, city: j.city || '' };
    } catch (e) { /* 继续尝试下一个 */ }
    try {
      const r = await fetch('https://ipwho.is/');
      const j = await r.json();
      if (j.latitude != null) return { lat: j.latitude, lon: j.longitude, city: j.city || '' };
    } catch (e) { /* 忽略 */ }
    return { lat: 39.9042, lon: 116.4074, city: '北京' };
  }
};

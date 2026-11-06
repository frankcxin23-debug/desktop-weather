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

  // WMO 天气代码 → 中文描述
  desc(code) {
    const m = { 0: '晴', 1: '基本晴', 2: '局部多云', 3: '阴',
      45: '雾', 48: '雾凇',
      51: '毛毛雨', 53: '毛毛雨', 55: '浓毛毛雨', 56: '冻毛毛雨', 57: '冻毛毛雨',
      61: '小雨', 63: '中雨', 65: '大雨', 66: '冻雨', 67: '强冻雨',
      71: '小雪', 73: '中雪', 75: '大雪', 77: '米雪',
      80: '阵雨', 81: '阵雨', 82: '强阵雨', 85: '阵雪', 86: '强阵雪',
      95: '雷阵雨', 96: '雷阵雨伴冰雹', 99: '雷阵雨伴冰雹' };
    return m[code] || '未知';
  },

  async fetch(lat, lon) {
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      '&current=temperature_2m,weather_code,is_day,wind_speed_10m,cloud_cover,precipitation,relative_humidity_2m&timezone=auto';
    const res = await fetch(u);
    if (!res.ok) throw new Error('weather http ' + res.status);
    const j = await res.json();
    const c = j.current;
    return {
      condition: this.condition(c.weather_code),
      desc: this.desc(c.weather_code),
      isDay: c.is_day === 1,
      temp: c.temperature_2m,
      // 真实气象要素，驱动特效细节
      env: {
        wind: c.wind_speed_10m ?? 2,          // km/h
        cloud: c.cloud_cover ?? 50,           // 0-100 %
        precip: c.precipitation ?? 0,         // mm/h
        temp: c.temperature_2m ?? 15,         // °C
        humidity: c.relative_humidity_2m ?? 60 // 0-100 %
      }
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

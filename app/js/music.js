// 背景音乐引擎：按国家拉取 iTunes 热门单曲 + 按天气情绪选曲
// 使用官方 30s 预览音频（免费、无需 Key、支持 CORS），低音量氛围连播
'use strict';
const Music = {
  // 多屏时只有主屏出声（副屏 WebView 由壳加载 ?nosound=1）
  get muted() { return window.MUSIC_MUTED === true; },
  audio: null,
  queue: [],
  qi: -1,
  paused: false,        // 用户通过菜单栏暂停/恢复（所有模式通用，默认播放）
  fadeIn: null,
  country: 'CN',
  weather: null,        // { condition, isDay }
  city: '',
  now: null,            // { title, artist, playing }
  cfg: { enabled: true, mode: 'always', volume: 0.35, weathers: [], cities: [], provider: 'itunes', spotifyId: '', spotifySecret: '' },
  _spTok: null, _spExp: 0, _spFail: false,

  // ---- 配置 ----
  applyConfig(m) {
    if (!m) m = {};
    this.cfg = {
      enabled: m.enabled !== false,
      mode: m.mode || 'always',
      volume: typeof m.volume === 'number' ? m.volume : 0.35,
      weathers: Array.isArray(m.weathers) ? m.weathers : [],
      cities: Array.isArray(m.cities) ? m.cities : [],
      provider: m.provider === 'spotify' ? 'spotify' : 'itunes',
      spotifyId: typeof m.spotifyId === 'string' ? m.spotifyId : '',
      spotifySecret: typeof m.spotifySecret === 'string' ? m.spotifySecret : ''
    };
    // 凭据变更后重新尝试 Spotify
    if (this._spId !== this.cfg.spotifyId || this._spSec !== this.cfg.spotifySecret) {
      this._spId = this.cfg.spotifyId; this._spSec = this.cfg.spotifySecret;
      this._spTok = null; this._spFail = false;
    }
    this.evalAndSync();
  },

  setWeather(condition, isDay, city, country) {
    const changed = condition !== (this.weather && this.weather.condition) ||
      isDay !== (this.weather && this.weather.isDay) ||
      (city || '') !== this.city;
    const ccChanged = country && country !== this.country;
    this.weather = { condition, isDay };
    this.city = city || '';
    if (country) this.country = country;
    if (changed || ccChanged) this.evalAndSync(true);
    else this.evalAndSync();
  },

  shouldPlay() {
    if (!this.cfg.enabled || this.paused) return false;
    if (!this.weather) return false;
    const cond = this.weather.condition;
    switch (this.cfg.mode) {
      case 'always': return true;
      case 'manual': return true; // 到达这里说明未暂停
      case 'weather':
        return this.cfg.weathers.includes(cond);
      case 'city': {
        const c = this.city.trim();
        if (!c) return false;
        return this.cfg.cities.some(x => c.includes(x.trim()) || x.trim().includes(c));
      }
      default: return false;
    }
  },

  // 菜单栏播放/暂停（所有模式通用）
  toggle() {
    this.paused = !this.paused;
    this.evalAndSync();
  },

  async evalAndSync(rebuild) {
    if (this.muted) return;
    const should = this.shouldPlay();
    if (should) {
      if (rebuild || !this.queue.length) await this.buildQueue();
      if (this.queue.length) this.play();
      else this.stop();
    } else {
      this.stop();
    }
    this.push();
  },

  // ---- 天气 → 情绪搜索词（阴雨低音、晴天明快）----
  moodTerms(cond, isDay, cc) {
    const zh = cc === 'CN' || cc === 'TW' || cc === 'HK' || cc === 'SG';
    const jp = cc === 'JP';
    const M = {
      'rain':    zh ? ['雨天 流行', '忧郁 情歌', '悲伤 钢琴'] : jp ? ['雨 ポップ', '切ない', 'バラード'] : ['rainy day', 'sad ballad', 'lofi beats'],
      'drizzle': zh ? ['雨天 轻音乐', '安静 流行'] : jp ? ['雨 環境音楽', 'チル'] : ['drizzle chill', 'soft rain', 'ambient'],
      'thunder': zh ? ['黑暗 电影配乐', '紧张 电子'] : jp ? ['暗い 映画音楽'] : ['dark cinematic', 'storm ambient', 'dark ambient'],
      'snow':    zh ? ['冬日 温暖', '雪 钢琴'] : jp ? ['冬 静か', 'ピアノ'] : ['snow chill', 'cozy piano', 'winter acoustic'],
      'fog':     zh ? ['迷雾 氛围', '安静 钢琴'] : jp ? ['霧 アンビエント'] : ['fog ambient', 'dreamy', 'ethereal'],
      'overcast':zh ? ['阴天 情歌', '低音 舒缓'] : jp ? ['曇り チル'] : ['moody indie', 'mellow', 'melancholy pop'],
      'partly':  zh ? ['轻松 流行', '惬意'] : jp ? ['リラックス'] : ['easy listening', 'feel good', 'sunny pop'],
      'clear':   isDay ? (zh ? ['夏日 明快', '元气 流行'] : jp ? ['夏 ポップ', '元気'] : ['summer hits', 'feel good', 'happy pop'])
                       : (zh ? ['深夜 情歌', '夜 氛围'] : jp ? ['夜 バラード'] : ['midnight chill', 'night lofi', 'late night'])
    };
    return M[cond] || M['partly'];
  },

  isGloomy(cond) {
    return ['rain', 'drizzle', 'thunder', 'fog', 'overcast', 'snow'].includes(cond);
  },

  // ---- iTunes API ----
  async api(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error('itunes ' + r.status);
    return r.json();
  },

  async searchMood(term) {
    try {
      const j = await this.api(`https://itunes.apple.com/search?term=${encodeURIComponent(term)}` +
        `&country=${this.country.toLowerCase()}&media=music&entity=song&limit=10`);
      return (j.results || []).filter(t => t.previewUrl).map(t => this.norm(t));
    } catch (e) { return []; }
  },

  async topSongs() {
    try {
      const j = await this.api(`https://itunes.apple.com/${this.country.toLowerCase()}/rss/topsongs/limit=25/json`);
      const entries = (j.feed && j.feed.entry) || [];
      const ids = entries.map(e => e.id && e.id.attributes && e.id.attributes['im:id']).filter(Boolean).slice(0, 20);
      if (!ids.length) return [];
      const lk = await this.api(`https://itunes.apple.com/lookup?id=${ids.join(',')}&country=${this.country.toLowerCase()}`);
      return (lk.results || []).filter(t => t.previewUrl).map(t => this.norm(t));
    } catch (e) { return []; }
  },

  norm(t) {
    return {
      title: t.trackName || t['im:name']?.label || '未知',
      artist: t.artistName || t['im:artist']?.label || '',
      url: t.previewUrl,
      art: (t.artworkUrl100 || '').replace('100x100', '200x200')
    };
  },

  // ---- Spotify 选曲（付费版：用户自备凭据；仅用于选曲，播放仍走 iTunes 预览）----
  async spToken() {
    if (this._spTok && Date.now() < this._spExp) return this._spTok;
    const id = (this.cfg.spotifyId || '').trim(), sec = (this.cfg.spotifySecret || '').trim();
    if (!id || !sec) throw new Error('spotify: no credentials');
    const r = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(id + ':' + sec),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'grant_type=client_credentials'
    });
    if (!r.ok) throw new Error('spotify token ' + r.status);
    const j = await r.json();
    if (!j.access_token) throw new Error('spotify: no token');
    this._spTok = j.access_token;
    this._spExp = Date.now() + (Math.max(60, (j.expires_in || 3600) - 120)) * 1000;
    return this._spTok;
  },

  async spSearchMood(term) {
    const tok = await this.spToken();
    const r = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(term)}` +
      `&type=track&limit=10&market=${this.country.toUpperCase()}`, {
      headers: { 'Authorization': 'Bearer ' + tok }
    });
    if (!r.ok) throw new Error('spotify search ' + r.status);
    const j = await r.json();
    return ((j.tracks && j.tracks.items) || [])
      .map(t => ({ title: t.name, artist: (t.artists && t.artists[0] && t.artists[0].name) || '' }))
      .filter(t => t.title);
  },

  // Spotify 只给元数据，用 iTunes 反查可播放的官方预览
  async itunesResolve(t) {
    try {
      const q = `${t.title} ${t.artist}`.trim();
      const j = await this.api(`https://itunes.apple.com/search?term=${encodeURIComponent(q)}` +
        `&country=${this.country.toLowerCase()}&media=music&entity=song&limit=1`);
      const hit = (j.results || []).find(x => x.previewUrl);
      return hit ? this.norm(hit) : null;
    } catch (e) { return null; }
  },

  spotifyUsable() {
    return this.cfg.provider === 'spotify' &&
      !!this.cfg.spotifyId.trim() && !!this.cfg.spotifySecret.trim() && !this._spFail;
  },

  // 队列 = 情绪曲目为主 +（天气好时混入地区热门）
  async buildQueue() {
    if (!this.weather) return;
    const cond = this.weather.condition;
    const terms = this.moodTerms(cond, this.weather.isDay, this.country);
    let mood = [], viaSpotify = false;

    // 付费路径：Spotify 选曲 → iTunes 换预览；任何失败都回退免费路径
    if (this.spotifyUsable()) {
      try {
        const lists = await Promise.all(terms.slice(0, 2).map(t => this.spSearchMood(t)));
        const cands = lists.flat();
        if (cands.length) {
          const resolved = (await Promise.all(cands.slice(0, 12).map(t => this.itunesResolve(t)))).filter(Boolean);
          if (resolved.length) { mood = resolved; viaSpotify = true; }
        }
      } catch (e) { this._spFail = true; }
    }
    if (!viaSpotify) {
      const picks = await Promise.all(terms.slice(0, 2).map(t => this.searchMood(t)));
      mood = picks.flat();
    }
    let hot = [];
    if (!this.isGloomy(cond)) hot = await this.topSongs();
    else if (mood.length < 5) hot = await this.topSongs();

    let all = [...mood, ...hot];
    // 去重
    const seen = new Set();
    all = all.filter(t => { const k = t.title + '|' + t.artist; if (seen.has(k)) return false; seen.add(k); return true; });
    // 洗牌
    for (let i = all.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [all[i], all[j]] = [all[j], all[i]];
    }
    this.queue = all;
    this.qi = -1;
  },

  // ---- 播放控制 ----
  play() {
    if (!this.queue.length) { this.push(); return; }
    if (!this.audio) {
      this.audio = new Audio();
      this.audio.preload = 'auto';
      this.audio.addEventListener('ended', () => this.next());
      this.audio.addEventListener('error', () => this.next());
    }
    if (this.audio.paused && this.qi >= 0) { this.resume(); return; }
    this.next(true);
  },

  resume() {
    this.audio.play().then(() => this.fadeTo(this.cfg.volume)).catch(() => {});
    this.now = { ...this.now, playing: true };
    this.push();
  },

  stop() {
    if (this.audio && !this.audio.paused) this.fadeTo(0, () => this.audio.pause());
    if (this.now) { this.now = { ...this.now, playing: false }; this.push(); }
  },

  next(internal) {
    if (this.paused || !this.queue.length) return;
    this.qi = (this.qi + 1) % this.queue.length;
    const t = this.queue[this.qi];
    if (!this.audio) return;
    this.audio.src = t.url;
    this.now = { title: t.title, artist: t.artist, playing: true };
    this.audio.volume = 0;
    const p = this.audio.play();
    if (p && p.catch) p.catch(() => { /* 自动播放被拒或加载失败，跳下一首 */ });
    this.fadeTo(this.cfg.volume);
    this.push();
  },

  setVolume(v) {
    this.cfg.volume = v;
    if (this.audio && !this.audio.paused) this.fadeTo(v);
  },

  fadeTo(target, done) {
    if (!this.audio) return;
    clearInterval(this.fadeIn);
    const step = () => {
      const cur = this.audio.volume;
      if (Math.abs(cur - target) < 0.02) {
        this.audio.volume = target;
        clearInterval(this.fadeIn);
        if (target === 0 && done) done();
        return;
      }
      this.audio.volume = cur + Math.sign(target - cur) * 0.02;
    };
    this.fadeIn = setInterval(step, 60);
  },

  // ---- 播放状态推送给壳（菜单栏显示）----
  push() {
    if (this.muted) return;
    const msg = {
      type: 'music',
      playing: !!(this.now && this.now.playing),
      paused: this.paused,
      title: (this.now && this.now.title) || '',
      artist: (this.now && this.now.artist) || '',
      mode: this.cfg.mode,
      enabled: this.cfg.enabled
    };
    DWUtil.send(msg);
  }
};

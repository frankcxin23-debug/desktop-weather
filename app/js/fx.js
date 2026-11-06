// 桌面天气氛围引擎（Canvas 2D）：色调 / 辉光 / 星空 / 流云 / 雨雪粒子 / 玻璃水珠 / 闪电 / 暗角
'use strict';
const FX = (() => {
  const canvas = document.getElementById('fx');
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, DPR = 1;

  const state = { condition: 'clear', isDay: true, intensity: 1,
    env: { wind: 4, cloud: 60, precip: 0.5, temp: 15, humidity: 65 } };
  let prevKey = null, curKey = 'clear-day';
  let tintBlend = 1;   // 色调交叉过渡 0→1
  let fade = 1;        // 粒子/云 淡入 0→1

  let stars = [], clouds = [], rains = [], snows = [], motes = [], drops = [];
  let dropAcc = 0, nextFlash = Infinity, flashT = -1;
  let vignette = null;
  let last = performance.now();

  const key = s => s.condition + (s.isDay ? '-day' : '-night');
  const rand = (a, b) => a + Math.random() * (b - a);
  const ease = t => t * t * (3 - 2 * t);

  // ---------- 贴图 ----------
  function makeSprite(w, h, draw) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    return c;
  }
  const rainSprite = makeSprite(4, 40, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, 'rgba(200,215,245,0)');
    gr.addColorStop(0.65, 'rgba(200,215,245,0.75)');
    gr.addColorStop(1, 'rgba(220,232,255,0.95)');
    g.fillStyle = gr;
    g.fillRect(1, 0, 2, h);
  });
  const snowSprite = makeSprite(16, 16, (g, w, h) => {
    const gr = g.createRadialGradient(8, 8, 0, 8, 8, 8);
    gr.addColorStop(0, 'rgba(255,255,255,0.95)');
    gr.addColorStop(0.6, 'rgba(255,255,255,0.5)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  });
  const moteSprite = makeSprite(12, 12, (g, w, h) => {
    const gr = g.createRadialGradient(6, 6, 0, 6, 6, 6);
    gr.addColorStop(0, 'rgba(255,235,190,0.9)');
    gr.addColorStop(1, 'rgba(255,235,190,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  });
  const dropSprite = makeSprite(12, 30, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, 'rgba(255,255,255,0.10)');
    gr.addColorStop(1, 'rgba(255,255,255,0.75)');
    g.fillStyle = gr;
    g.beginPath();
    g.roundRect(2, 4, 8, 25, 4);
    g.fill();
    const hg = g.createRadialGradient(6, 6, 0, 6, 6, 6);
    hg.addColorStop(0, 'rgba(255,255,255,0.9)');
    hg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = hg;
    g.fillRect(0, 0, 12, 12);
  });
  const cloudCache = {};
  function cloudSprite(r, g, b) {
    const k = `${r},${g},${b}`;
    if (cloudCache[k]) return cloudCache[k];
    const sp = makeSprite(480, 240, (c) => {
      const blobs = [[240,120,110],[150,145,82],[330,148,86],[190,108,70],[300,104,66],[112,128,56],[368,128,60]];
      for (const [x, y, rad] of blobs) {
        const gr = c.createRadialGradient(x, y, 0, x, y, rad);
        gr.addColorStop(0, `rgba(${r*255|0},${g*255|0},${b*255|0},0.55)`);
        gr.addColorStop(1, `rgba(${r*255|0},${g*255|0},${b*255|0},0)`);
        c.fillStyle = gr;
        c.fillRect(0, 0, 480, 240);
      }
    });
    cloudCache[k] = sp;
    return sp;
  }

  // ---------- 尺寸 ----------
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 1.5);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W * DPR; canvas.height = H * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    vignette = makeSprite(Math.max(2, W / 2 | 0), Math.max(2, H / 2 | 0), (g, w, h) => {
      const gr = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.62, w / 2, h / 2, Math.hypot(w, h) * 0.72);
      gr.addColorStop(0, 'rgba(0,0,0,0)');
      gr.addColorStop(1, 'rgba(0,0,0,0.30)');
      g.fillStyle = gr;
      g.fillRect(0, 0, w, h);
    });
    rebuild();
  }

  // ---------- 场景重建 ----------
  function areaK() { return Math.max(0.6, Math.min(1.6, (W * H) / (1440 * 900))); }

  // ---- 真实气象要素 → 视觉参数 ----
  const windPx = () => Math.min(150, state.env.wind * 3.2);            // km/h → 水平漂移 px/s
  const precipK = f => {                                                // 降水强度 → 粒子密度系数
    const p = state.env.precip;
    return f(p);
  };
  const cloudK = () => 0.3 + (state.env.cloud / 100) * 1.2;             // 云量 0-100 → 云数量系数
  const tempShift = () =>                                               // 温度 → 额外色调层
    state.env.temp <= 0 ? { c: '160,200,255', a: Math.min(-state.env.temp / 25, 1) * 0.10 } :
    state.env.temp >= 30 ? { c: '255,150,60', a: Math.min((state.env.temp - 30) / 15, 1) * 0.08 } :
    null;
  const hazeA = () =>                                                   // 湿度 → 底部薄雾
    (state.condition !== 'fog' && state.env.humidity > 82)
      ? (state.env.humidity - 82) / 18 * 0.10 : 0;

  function rebuild(keepScene) {
    const { condition, isDay, intensity } = state;
    const k = areaK() * intensity;
    const pal = PALETTES[curKey] || PALETTES['clear-day'];

    // 星空（晴夜）
    if (!keepScene) stars = [];
    if (condition === 'clear' && !isDay && stars.length === 0) {
      const n = Math.round((W * H) / 16000 * intensity);
      for (let i = 0; i < n; i++) {
        stars.push({ x: Math.random() * W, y: Math.random() * H * 0.85, r: rand(0.5, 1.9),
          ph: rand(0, 6.28), sp: rand(0.3, 1.3), warm: Math.random() < 0.2 });
      }
    }
    if (condition !== 'clear' || isDay) stars = [];

    // 流云
    if (!keepScene) clouds = [];
    if (pal.clouds && clouds.length === 0) {
      const cc = pal.clouds;
      const n = Math.max(1, Math.round(cc.count * areaK() * Math.min(intensity, 1.4) * cloudK()));
      const sp = cloudSprite(cc.c[0], cc.c[1], cc.c[2]);
      for (let i = 0; i < n; i++) {
        const sc = rand(cc.scale[0], cc.scale[1]);
        clouds.push({ sp, w: 480 * sc, h: 240 * sc, x: Math.random() * (W + 800) - 400,
          y: H * rand(cc.y[0], cc.y[1]), v: rand(cc.v[0], cc.v[1]), a: cc.a });
      }
    }
    if (!pal.clouds) clouds = [];

    // 雨（三层景深）
    rains = [];
    const rainFactor = (condition === 'rain' ? 1 * precipK(p => Math.min(Math.max(p / 2.5, 0.55), 1.6))
      : condition === 'drizzle' ? 0.45 * precipK(p => Math.min(Math.max(p / 0.4, 0.6), 1.3))
      : condition === 'thunder' ? 1.4 * precipK(p => Math.min(Math.max(p / 4, 0.8), 1.5))
      : 0);
    if (rainFactor > 0) {
      const layers = [
        { n: 110, w: [2.2, 3.4], len: [26, 44], v: [880, 1200], a: 0.50, drift: 20 },
        { n: 42,  w: [1.2, 2.0], len: [16, 26], v: [620, 820],  a: 0.26, drift: 28 },
        { n: 16,  w: [3.6, 5.2], len: [42, 62], v: [1150, 1450], a: 0.60, drift: 14 }
      ];
      for (const L of layers) {
        const n = Math.round(L.n * rainFactor * k);
        for (let i = 0; i < n; i++) rains.push(newRain(L, true));
      }
    }

    // 雪（双层景深）
    snows = [];
    if (condition === 'snow') {
      const snowK = precipK(p => Math.min(Math.max(0.7 + p * 1.2, 0.8), 1.6));
      const near = Math.round(18 * k * snowK), far = Math.round(30 * k * snowK);
      for (let i = 0; i < near; i++) snows.push(newSnow([2.6, 4.2], [85, 125], 0.9, true));
      for (let i = 0; i < far; i++) snows.push(newSnow([1.2, 2.2], [45, 75], 0.5, true));
    }

    // 晴天光尘
    motes = [];
    if (condition === 'clear' && isDay) {
      const n = Math.round(24 * k);
      for (let i = 0; i < n; i++) {
        motes.push({ x: Math.random() * W, y: Math.random() * H, r: rand(2, 5),
          vx: rand(-4, 4), vy: rand(-22, -8), ph: rand(0, 6.28), sp: rand(0.4, 1.0) });
      }
    }

    if (!keepScene) {
      drops = [];
      dropAcc = 0;
      nextFlash = condition === 'thunder' ? performance.now() + rand(3000, 9000) : Infinity;
      flashT = -1;
    }
  }

  function newRain(L, anywhere) {
    return { x: Math.random() * (W + 80) - 40, y: anywhere ? Math.random() * H : rand(-80, -20),
      w: rand(L.w[0], L.w[1]), len: rand(L.len[0], L.len[1]), v: rand(L.v[0], L.v[1]),
      drift: L.drift + rand(-6, 6), a: L.a * rand(0.7, 1.15) };
  }
  function newSnow(rR, vR, a, anywhere) {
    return { bx: Math.random() * W, y: anywhere ? Math.random() * H : rand(-30, -10),
      r: rand(rR[0], rR[1]), v: rand(vR[0], vR[1]), amp: rand(8, 30), frq: rand(0.3, 0.9),
      ph: rand(0, 6.28), a: a * rand(0.7, 1.1) };
  }

  // ---------- 状态 ----------
  function setState(next) {
    const condChanged = next.condition !== state.condition || next.isDay !== state.isDay;
    const intChanged = next.intensity !== undefined &&
      Math.abs(next.intensity - state.intensity) > 0.001;
    const prevEnv = state.env;
    Object.assign(state, next);
    const nk = key(state);
    const envChanged = next.env !== undefined &&
      ['wind', 'cloud', 'precip'].some(kk => next.env[kk] !== prevEnv[kk]);
    if (condChanged) {
      prevKey = curKey; curKey = nk;
      tintBlend = 0; fade = 0;
      rebuild(false);
    } else if (nk !== curKey) {
      curKey = nk;
      rebuild(false);
    } else if (intChanged || envChanged) {
      // 强度或气象要素变化：重建粒子密度，保留云/星空/水珠场景避免跳变
      rebuild(true);
    }
  }

  // ---------- 绘制 ----------
  function drawTint(k, alphaMul) {
    const pal = PALETTES[k];
    if (!pal) return;
    const gr = ctx.createLinearGradient(0, 0, 0, H);
    const cap = Math.min(state.intensity, 1.8);
    for (const [p, r, g, b, a] of pal.stops) {
      gr.addColorStop(p, `rgba(${r*255|0},${g*255|0},${b*255|0},${Math.min(a * cap, 0.92) * alphaMul})`);
    }
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, W, H);
  }

  function drawGlow(t, alphaMul) {
    const pal = PALETTES[curKey];
    const gl = pal && pal.glow;
    if (!gl) return;
    const pulse = 0.82 + 0.18 * Math.sin(t * gl.speed);
    const cx = gl.x * W, cy = gl.y * H, rad = gl.r * Math.max(W, H);
    const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
    const a = gl.a * state.intensity * pulse * alphaMul;
    gr.addColorStop(0, `rgba(${gl.c[0]*255|0},${gl.c[1]*255|0},${gl.c[2]*255|0},${Math.min(a, 0.85)})`);
    gr.addColorStop(1, `rgba(${gl.c[0]*255|0},${gl.c[1]*255|0},${gl.c[2]*255|0},0)`);
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, W, H);
  }

  // 真实气象氛围层：温度色调 + 湿度薄雾（每帧微妙叠加）
  function drawAmbient(alphaMul) {
    const ts = tempShift();
    if (ts && ts.a > 0.005) {
      ctx.fillStyle = `rgba(${ts.c},${ts.a * state.intensity * alphaMul})`;
      ctx.fillRect(0, 0, W, H);
    }
    const hz = hazeA();
    if (hz > 0.004) {
      const gr = ctx.createLinearGradient(0, H * 0.55, 0, H);
      gr.addColorStop(0, 'rgba(215,225,238,0)');
      gr.addColorStop(1, `rgba(215,225,238,${hz * state.intensity * alphaMul})`);
      ctx.fillStyle = gr;
      ctx.fillRect(0, H * 0.55, W, H * 0.45);
    }
  }

  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    const t = now / 1000;
    if (tintBlend < 1) tintBlend = Math.min(1, tintBlend + dt / 1.4);
    if (fade < 1) fade = Math.min(1, fade + dt / 1.2);
    const fA = ease(fade);

    ctx.clearRect(0, 0, W, H);

    // 色调（交叉过渡）
    if (tintBlend < 1 && prevKey) {
      drawTint(prevKey, 1 - ease(tintBlend));
      drawTint(curKey, ease(tintBlend));
    } else {
      drawTint(curKey, 1);
    }

    drawGlow(t, fA);
    drawAmbient(fA);

    // 星空
    if (stars.length) {
      for (const s of stars) {
        const a = (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * s.sp + s.ph))) * fA;
        ctx.globalAlpha = a;
        ctx.fillStyle = s.warm ? 'rgb(255,238,210)' : 'rgb(235,242,255)';
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, 6.283);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // 流云（速度随风速增强，支持双向环绕）
    const wpx = windPx();
    for (const c of clouds) {
      c.x += (c.v + wpx * 0.5) * dt;
      if (c.x - c.w / 2 > W) c.x = -c.w / 2;
      else if (c.x + c.w / 2 < 0) c.x = W + c.w / 2;
      ctx.globalAlpha = c.a * fA * Math.min(state.intensity, 1.5);
      ctx.drawImage(c.sp, c.x - c.w / 2, c.y - c.h / 2, c.w, c.h);
    }
    ctx.globalAlpha = 1;

    // 雨（倾角随风速增大）
    if (rains.length) {
      for (let i = 0; i < rains.length; i++) {
        const p = rains[i];
        p.y += p.v * dt;
        p.x += (p.drift + wpx) * dt;
        if (p.y > H + 60 || p.x < -120 || p.x > W + 120) rains[i] = newRain(p, false);
        ctx.globalAlpha = p.a * fA;
        ctx.drawImage(rainSprite, p.x, p.y, p.w, p.len);
      }
      ctx.globalAlpha = 1;
    }

    // 雪（水平漂移随风速增大）
    for (const s of snows) {
      s.y += s.v * dt;
      s.bx += wpx * 0.6 * dt;
      if (s.bx < -40) s.bx += W + 80; else if (s.bx > W + 40) s.bx -= W + 80;
      const x = s.bx + Math.sin(t * s.frq + s.ph) * s.amp;
      if (s.y > H + 20) { s.y = rand(-30, -10); s.bx = Math.random() * W; }
      ctx.globalAlpha = s.a * fA;
      const d = s.r * 4;
      ctx.drawImage(snowSprite, x - d / 2, s.y - d / 2, d, d);
    }
    ctx.globalAlpha = 1;

    // 光尘
    for (const m of motes) {
      m.x += m.vx * dt; m.y += m.vy * dt;
      if (m.y < -20) { m.y = H + 20; m.x = Math.random() * W; }
      ctx.globalAlpha = (0.18 + 0.22 * (0.5 + 0.5 * Math.sin(t * m.sp + m.ph))) * fA;
      const d = m.r * 2.4;
      ctx.drawImage(moteSprite, m.x - d / 2, m.y - d / 2, d, d);
    }
    ctx.globalAlpha = 1;

    // 玻璃滑落水珠
    const dropCfg = state.condition === 'rain' ? { iv: 1.4, max: 9 }
      : state.condition === 'drizzle' ? { iv: 2.6, max: 5 }
      : state.condition === 'thunder' ? { iv: 0.9, max: 12 } : null;
    if (dropCfg) {
      const pk = precipK(p => Math.min(Math.max(0.6 + p * 0.35, 0.7), 1.7)); // 降水越大水珠越频繁
      dropAcc += dt;
      const iv = dropCfg.iv / (Math.max(state.intensity, 0.4) * pk);
      const max = Math.round(dropCfg.max * state.intensity);
      if (dropAcc > iv && drops.length < max) {
        dropAcc = 0;
        drops.push({ x: rand(20, W - 20), y: -40, v: rand(50, 90), s: rand(0.7, 1.5),
          ph: rand(0, 6.28), a: rand(0.45, 0.85) });
      }
      for (let i = drops.length - 1; i >= 0; i--) {
        const d = drops[i];
        d.v = Math.min(d.v + 26 * dt, 170);
        d.y += d.v * dt;
        const x = d.x + Math.sin(d.y * 0.02 + d.ph) * 5;
        if (d.y > H + 60) { drops.splice(i, 1); continue; }
        // 尾部水痕
        const tail = Math.min(90, d.v * 0.7);
        const gr = ctx.createLinearGradient(0, d.y - tail, 0, d.y);
        gr.addColorStop(0, 'rgba(255,255,255,0)');
        gr.addColorStop(1, `rgba(255,255,255,${0.22 * d.a})`);
        ctx.fillStyle = gr;
        ctx.fillRect(x - 1, d.y - tail, 2, tail);
        // 水珠头部
        ctx.globalAlpha = d.a;
        ctx.drawImage(dropSprite, x - 6 * d.s, d.y - 15 * d.s, 12 * d.s, 30 * d.s);
        ctx.globalAlpha = 1;
      }
    }

    // 闪电
    if (state.condition === 'thunder') {
      if (now >= nextFlash) { flashT = 0; nextFlash = now + rand(5000, 14000); }
      if (flashT >= 0) {
        flashT += dt;
        let a = 0;
        if (flashT < 0.08) a = flashT / 0.08 * 0.34;
        else if (flashT < 0.18) a = 0.06;
        else if (flashT < 0.30) a = 0.24 * (1 - (flashT - 0.18) / 0.12);
        else if (flashT < 0.45) a = 0.10;
        else flashT = -1;
        if (a > 0) {
          ctx.fillStyle = `rgba(240,245,255,${a})`;
          ctx.fillRect(0, 0, W, H);
        }
      }
    }

    // 暗角
    if (vignette) {
      ctx.globalAlpha = 0.9;
      ctx.drawImage(vignette, 0, 0, W, H);
      ctx.globalAlpha = 1;
    }

    requestAnimationFrame(frame);
  }

  window.addEventListener('resize', resize);
  resize();
  requestAnimationFrame(frame);

  return { setState };
})();

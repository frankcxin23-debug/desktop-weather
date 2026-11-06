// 世界地图选城组件：苹果世界时钟风格
// 大陆剪影 + 城市圆点（真实经纬度），点击选择；hover/选中显示城市名
// 坐标系：land path 为 1x（x=lon+180, y=90-lat），整体 scale(2) 渲染，viewBox 裁掉极地
'use strict';
window.WorldMap = (() => {
  const S = 2;                       // 渲染倍率
  const VIEW_Y = 24;                 // viewBox 起点（lat 78°N）
  const VIEW_H = 292;                // viewBox 高（lat 78 ~ -56）
  const VIEW_W = 720;

  const proj = (lat, lon) => ({ x: (lon + 180) * S, y: (90 - lat) * S });

  function render(el, points, selName, onPick) {
    el.classList.add('worldmap');
    const NS = 'http://www.w3.org/2000/svg';
    el.innerHTML = '';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 ${VIEW_Y} ${VIEW_W} ${VIEW_H}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    // 大陆剪影
    const land = document.createElementNS(NS, 'path');
    land.setAttribute('d', window.WORLD_LAND_PATH || '');
    land.setAttribute('transform', `scale(${S})`);
    land.setAttribute('class', 'wm-land');
    svg.appendChild(land);

    // 城市点（去重：选中城市若在列表中则不重复）
    const seen = new Set();
    for (const p of points) {
      if (seen.has(p.name)) continue;
      seen.add(p.name);
      const sel = p.name === selName;
      const { x, y } = proj(p.lat, p.lon);

      const g = document.createElementNS(NS, 'g');
      g.setAttribute('class', 'wm-city' + (sel ? ' sel' : ''));
      g.setAttribute('transform', `translate(${x} ${y})`);

      if (sel) {
        const halo = document.createElementNS(NS, 'circle');
        halo.setAttribute('r', 15);
        halo.setAttribute('class', 'wm-halo');
        g.appendChild(halo);
      }
      const dot = document.createElementNS(NS, 'circle');
      dot.setAttribute('r', sel ? 6.5 : 4.5);
      dot.setAttribute('class', 'wm-dot');
      g.appendChild(dot);

      const label = document.createElementNS(NS, 'text');
      label.textContent = p.name;
      label.setAttribute('class', 'wm-label');
      label.setAttribute('y', -10);
      // 靠右侧边缘的城市名放左边，避免溢出
      if (x > VIEW_W - 90) label.setAttribute('text-anchor', 'end');
      else if (x < 70) label.setAttribute('text-anchor', 'start');
      else label.setAttribute('text-anchor', 'middle');
      g.appendChild(label);

      // 扩大点击热区
      const hit = document.createElementNS(NS, 'circle');
      hit.setAttribute('r', 16);
      hit.setAttribute('fill', 'transparent');
      g.appendChild(hit);

      if (onPick) {
        g.addEventListener('click', () => onPick(p));
        g.addEventListener('mouseenter', () => g.classList.add('hover'));
        g.addEventListener('mouseleave', () => g.classList.remove('hover'));
      } else {
        g.style.cursor = 'default';
      }
      svg.appendChild(g);
    }
    el.appendChild(svg);
  }

  return { render };
})();

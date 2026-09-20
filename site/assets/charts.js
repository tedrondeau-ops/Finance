const SERIES = ['--series-1', '--series-2', '--series-3', '--series-4', '--series-5', '--series-6', '--series-7', '--series-8'];

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function seriesColor(i) {
  return cssVar(SERIES[i % SERIES.length]);
}

// Part-to-whole: a single 100%-wide stacked bar plus a legend/table below it.
export function renderStackedBar(container, segments) {
  const total = segments.reduce((a, s) => a + s.value, 0) || 1;
  const bar = document.createElement('div');
  bar.className = 'stackbar';
  segments.forEach((s, i) => {
    const pct = (s.value / total) * 100;
    const seg = document.createElement('div');
    seg.className = 'seg';
    seg.style.width = pct.toFixed(3) + '%';
    seg.style.background = s.color || seriesColor(i);
    seg.title = `${s.label}: $${s.value.toLocaleString('en-US', { maximumFractionDigits: 0 })} (${pct.toFixed(1)}%)`;
    bar.appendChild(seg);
  });
  container.appendChild(bar);

  const legend = document.createElement('div');
  legend.className = 'legend';
  segments.forEach((s, i) => {
    const pct = (s.value / total) * 100;
    const item = document.createElement('span');
    const swatch = document.createElement('span');
    swatch.className = 'swatch';
    swatch.style.background = s.color || seriesColor(i);
    item.appendChild(swatch);
    item.appendChild(document.createTextNode(`${s.label} — $${s.value.toLocaleString('en-US', { maximumFractionDigits: 0 })} (${pct.toFixed(1)}%)`));
    legend.appendChild(item);
  });
  container.appendChild(legend);
}

let gradientCounter = 0;

// Ring/donut chart: composition at a glance, with an exact legend beside it
// (color alone never carries the value - every segment is also labeled).
export function renderDonut(container, segments, { size = 220, thickness = 32, centerLabel, centerSub } = {}) {
  const total = segments.reduce((a, s) => a + s.value, 0) || 1;
  const r = (size - thickness) / 2;
  const circumference = 2 * Math.PI * r;
  const cx = size / 2, cy = size / 2;

  const wrap = document.createElement('div');
  wrap.style.display = 'flex';
  wrap.style.flexWrap = 'wrap';
  wrap.style.alignItems = 'center';
  wrap.style.gap = '24px';

  const svg = svgEl('svg', { viewBox: `0 0 ${size} ${size}`, width: size, height: size, class: 'svg-chart', style: 'flex-shrink:0' });
  svg.appendChild(svgEl('circle', { cx, cy, r, fill: 'none', stroke: cssVar('--gridline'), 'stroke-width': thickness }));

  const group = svgEl('g', { transform: `rotate(-90 ${cx} ${cy})` });
  let offset = 0;
  segments.forEach((s, i) => {
    const pct = s.value / total;
    const len = pct * circumference;
    const gapPx = segments.length > 1 ? 2 : 0;
    const circle = svgEl('circle', {
      cx, cy, r, fill: 'none', stroke: s.color || seriesColor(i), 'stroke-width': thickness,
      'stroke-dasharray': `${Math.max(len - gapPx, 0)} ${circumference}`,
      'stroke-dashoffset': -offset,
    });
    const title = svgEl('title', {});
    title.textContent = `${s.label}: $${s.value.toLocaleString('en-US', { maximumFractionDigits: 0 })} (${(pct * 100).toFixed(1)}%)`;
    circle.appendChild(title);
    group.appendChild(circle);
    offset += len;
  });
  svg.appendChild(group);

  if (centerLabel) {
    const t1 = svgEl('text', { x: cx, y: cy - 2, 'text-anchor': 'middle', style: `font-size:20px;font-weight:600;fill:${cssVar('--text-primary')}` });
    t1.textContent = centerLabel;
    svg.appendChild(t1);
  }
  if (centerSub) {
    const t2 = svgEl('text', { x: cx, y: cy + 18, 'text-anchor': 'middle', style: `font-size:11px;fill:${cssVar('--text-muted')}` });
    t2.textContent = centerSub;
    svg.appendChild(t2);
  }
  wrap.appendChild(svg);

  const legend = document.createElement('div');
  legend.style.display = 'flex';
  legend.style.flexDirection = 'column';
  legend.style.gap = '8px';
  legend.style.fontSize = '13px';
  segments.forEach((s, i) => {
    const pct = (s.value / total) * 100;
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '8px';
    const swatch = document.createElement('span');
    swatch.className = 'swatch';
    swatch.style.background = s.color || seriesColor(i);
    swatch.style.marginRight = '0';
    row.appendChild(swatch);
    const text = document.createElement('span');
    text.style.color = 'var(--text-secondary)';
    text.innerHTML = `<strong style="color:var(--text-primary)">${s.label}</strong> — $${s.value.toLocaleString('en-US', { maximumFractionDigits: 0 })} (${pct.toFixed(1)}%)`;
    row.appendChild(text);
    legend.appendChild(row);
  });
  wrap.appendChild(legend);
  container.appendChild(wrap);
}

// Semicircular progress gauge - e.g. current value vs. a target.
export function renderGauge(container, { value, max, valueLabel, subLabel, color }) {
  const size = 220, cx = size / 2, cy = size / 2 + 10, r = 85, thickness = 20;
  const pct = max > 0 ? Math.min(value / max, 1) : 0;
  const halfCirc = Math.PI * r;

  const svg = svgEl('svg', { viewBox: `0 0 ${size} ${size / 2 + 30}`, width: '100%', style: 'max-width:280px', class: 'svg-chart' });
  const arcPath = (fromDeg, toDeg) => {
    const rad = (d) => (d * Math.PI) / 180;
    const x1 = cx + r * Math.cos(rad(fromDeg)), y1 = cy + r * Math.sin(rad(fromDeg));
    const x2 = cx + r * Math.cos(rad(toDeg)), y2 = cy + r * Math.sin(rad(toDeg));
    return `M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`;
  };
  svg.appendChild(svgEl('path', { d: arcPath(180, 360), fill: 'none', stroke: cssVar('--gridline'), 'stroke-width': thickness, 'stroke-linecap': 'round' }));
  const progressLen = pct * halfCirc;
  const fg = svgEl('path', {
    d: arcPath(180, 360), fill: 'none', stroke: color || cssVar('--series-1'), 'stroke-width': thickness, 'stroke-linecap': 'round',
    'stroke-dasharray': `${progressLen} ${halfCirc}`,
  });
  svg.appendChild(fg);

  const big = svgEl('text', { x: cx, y: cy - 8, 'text-anchor': 'middle', style: `font-size:24px;font-weight:600;fill:${cssVar('--text-primary')}` });
  big.textContent = valueLabel ?? `${Math.round(pct * 100)}%`;
  svg.appendChild(big);
  if (subLabel) {
    const sub = svgEl('text', { x: cx, y: cy + 14, 'text-anchor': 'middle', style: `font-size:12px;fill:${cssVar('--text-muted')}` });
    sub.textContent = subLabel;
    svg.appendChild(sub);
  }
  container.appendChild(svg);
}

function svgEl(tag, attrs) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

// Simple vertical bar chart. points: [{label, value}]
export function renderBarChart(container, points, { height = 200, valueFmt = (v) => v.toFixed(0), color } = {}) {
  const width = Math.max(container.clientWidth || 600, points.length * 48);
  const padL = 56, padB = 28, padT = 12, padR = 12;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const maxV = Math.max(...points.map((p) => p.value), 0);
  const minV = Math.min(...points.map((p) => p.value), 0);
  const range = maxV - minV || 1;
  const zeroY = padT + plotH * (maxV / range);

  const svg = svgEl('svg', { viewBox: `0 0 ${width} ${height}`, width: '100%', class: 'svg-chart' });
  // gridlines
  for (let i = 0; i <= 4; i++) {
    const y = padT + (plotH * i) / 4;
    svg.appendChild(svgEl('line', { x1: padL, x2: width - padR, y1: y, y2: y, class: 'grid-line' }));
    const val = maxV - (range * i) / 4;
    const t = svgEl('text', { x: padL - 8, y: y + 4, 'text-anchor': 'end' });
    t.textContent = valueFmt(val);
    svg.appendChild(t);
  }
  const barW = (plotW / points.length) * 0.6;
  const gap = (plotW / points.length) * 0.4;
  points.forEach((p, i) => {
    const x = padL + i * (barW + gap) + gap / 2;
    const barH = (Math.abs(p.value) / range) * plotH;
    const y = p.value >= 0 ? zeroY - barH : zeroY;
    const rect = svgEl('rect', { x, y, width: barW, height: Math.max(barH, 1), rx: 3, fill: color || cssVar('--series-1') });
    const title = svgEl('title', {});
    title.textContent = `${p.label}: ${valueFmt(p.value)}`;
    rect.appendChild(title);
    svg.appendChild(rect);
    const label = svgEl('text', { x: x + barW / 2, y: height - 8, 'text-anchor': 'middle' });
    label.textContent = p.label;
    svg.appendChild(label);
  });
  svg.appendChild(svgEl('line', { x1: padL, x2: width - padR, y1: zeroY, y2: zeroY, class: 'axis-line' }));
  container.appendChild(svg);
}

// Line chart for a single series over time. points: [{date (ISO), value}]
export function renderLineChart(container, points, { height = 220, valueFmt = (v) => v.toFixed(0), goal } = {}) {
  const width = Math.max(container.clientWidth || 600, 320);
  const padL = 64, padB = 28, padT = 16, padR = 16;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const values = points.map((p) => p.value).concat(goal ? [goal] : []);
  const maxV = Math.max(...values) * 1.05;
  const minV = Math.min(0, Math.min(...values));
  const range = maxV - minV || 1;

  const x = (i) => padL + (points.length <= 1 ? plotW / 2 : (plotW * i) / (points.length - 1));
  const y = (v) => padT + plotH * (1 - (v - minV) / range);

  const svg = svgEl('svg', { viewBox: `0 0 ${width} ${height}`, width: '100%', class: 'svg-chart' });
  for (let i = 0; i <= 4; i++) {
    const yy = padT + (plotH * i) / 4;
    svg.appendChild(svgEl('line', { x1: padL, x2: width - padR, y1: yy, y2: yy, class: 'grid-line' }));
    const val = maxV - (range * i) / 4;
    const t = svgEl('text', { x: padL - 8, y: yy + 4, 'text-anchor': 'end' });
    t.textContent = valueFmt(val);
    svg.appendChild(t);
  }
  if (goal) {
    const gy = y(goal);
    svg.appendChild(svgEl('line', { x1: padL, x2: width - padR, y1: gy, y2: gy, stroke: cssVar('--series-4'), 'stroke-width': 1.5, 'stroke-dasharray': '4,4' }));
    const gt = svgEl('text', { x: width - padR, y: gy - 6, 'text-anchor': 'end' });
    gt.textContent = `Goal: ${valueFmt(goal)}`;
    svg.appendChild(gt);
  }

  if (points.length > 1) {
    const gradId = `area-grad-${gradientCounter++}`;
    const defs = svgEl('defs', {});
    const grad = svgEl('linearGradient', { id: gradId, x1: 0, y1: 0, x2: 0, y2: 1 });
    const stop1 = svgEl('stop', { offset: '0%', 'stop-color': cssVar('--series-1'), 'stop-opacity': 0.25 });
    const stop2 = svgEl('stop', { offset: '100%', 'stop-color': cssVar('--series-1'), 'stop-opacity': 0 });
    grad.appendChild(stop1); grad.appendChild(stop2);
    defs.appendChild(grad);
    svg.appendChild(defs);

    const lineD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(p.value)}`).join(' ');
    const areaD = `${lineD} L ${x(points.length - 1)} ${y(minV)} L ${x(0)} ${y(minV)} Z`;
    svg.appendChild(svgEl('path', { d: areaD, fill: `url(#${gradId})`, stroke: 'none' }));
    svg.appendChild(svgEl('path', { d: lineD, fill: 'none', stroke: cssVar('--series-1'), 'stroke-width': 2, 'stroke-linecap': 'round' }));
  }
  points.forEach((p, i) => {
    const c = svgEl('circle', { cx: x(i), cy: y(p.value), r: 4, fill: cssVar('--series-1') });
    const title = svgEl('title', {});
    title.textContent = `${p.date}: ${valueFmt(p.value)}`;
    c.appendChild(title);
    svg.appendChild(c);
  });
  // sparse x labels
  const step = Math.max(1, Math.ceil(points.length / 6));
  points.forEach((p, i) => {
    if (i % step !== 0 && i !== points.length - 1) return;
    const label = svgEl('text', { x: x(i), y: height - 8, 'text-anchor': 'middle' });
    label.textContent = p.date.slice(5);
    svg.appendChild(label);
  });
  svg.appendChild(svgEl('line', { x1: padL, x2: width - padR, y1: y(0), y2: y(0), class: 'axis-line' }));
  container.appendChild(svg);
}

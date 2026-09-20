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
    const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(p.value)}`).join(' ');
    svg.appendChild(svgEl('path', { d, fill: 'none', stroke: cssVar('--series-1'), 'stroke-width': 2, 'stroke-linecap': 'round' }));
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

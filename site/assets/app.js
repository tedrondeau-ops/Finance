const SESSION_KEY = 'portfolioDataV1';

function base64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function decryptBundle(bundle, pin) {
  const enc = new TextEncoder();
  const salt = base64ToBytes(bundle.salt);
  const iv = base64ToBytes(bundle.iv);
  const data = base64ToBytes(bundle.data);
  const baseKey = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: bundle.iterations, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
  const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return JSON.parse(new TextDecoder().decode(plainBuf));
}

export async function getData() {
  const cached = sessionStorage.getItem(SESSION_KEY);
  if (cached) return JSON.parse(cached);

  const res = await fetch('data/bundle.enc.json', { cache: 'no-store' });
  const bundle = await res.json();

  const gate = document.getElementById('pin-gate');
  const app = document.getElementById('app');
  const form = document.getElementById('pin-form');
  const input = document.getElementById('pin-input');
  const errorEl = document.getElementById('pin-error');
  gate.style.display = 'flex';

  return new Promise((resolve) => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorEl.textContent = '';
      try {
        const data = await decryptBundle(bundle, input.value.trim());
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(data));
        gate.style.display = 'none';
        app.style.display = 'block';
        resolve(data);
      } catch (err) {
        errorEl.textContent = 'Incorrect PIN';
        input.value = '';
        input.focus();
      }
    });
    setTimeout(() => input.focus(), 50);
  });
}

export function fmtMoney(n, opts = {}) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  return sign + '$' + abs.toLocaleString('en-US', { minimumFractionDigits: opts.decimals ?? 0, maximumFractionDigits: opts.decimals ?? 0 });
}

export function fmtPct(n, decimals = 1) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return (n >= 0 ? '+' : '') + n.toFixed(decimals) + '%';
}

export function gainClass(n) {
  if (n === null || n === undefined) return '';
  return n >= 0 ? 'pos' : 'neg';
}

export function sortable(tableEl, rows, renderRow, initialSortKey, columns) {
  let sortKey = initialSortKey;
  let asc = false;
  function render() {
    const sorted = [...rows].sort((a, b) => {
      const va = a[sortKey], vb = b[sortKey];
      const cmp = typeof va === 'string' ? va.localeCompare(vb) : (va ?? -Infinity) - (vb ?? -Infinity);
      return asc ? cmp : -cmp;
    });
    const tbody = tableEl.querySelector('tbody');
    tbody.innerHTML = sorted.map(renderRow).join('');
  }
  const thead = tableEl.querySelector('thead tr');
  thead.querySelectorAll('th').forEach((th, i) => {
    th.addEventListener('click', () => {
      const key = columns[i];
      if (!key) return;
      if (sortKey === key) asc = !asc; else { sortKey = key; asc = false; }
      render();
    });
  });
  render();
}

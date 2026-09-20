import fs from 'node:fs';
import path from 'node:path';
import { parseCsv, money } from './csv.mjs';
import { fetchQuotes } from './prices.mjs';
import { encryptJSON, decryptJSON } from './crypto.mjs';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '..');
const OPTION_RE = /^-([A-Z]+)(\d{2})(\d{2})(\d{2})([PC])([\d.]+)$/;

function readCategories() {
  const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/categories.json'), 'utf8'));
  return { map: raw.categories, fallback: raw.default || 'Uncategorized' };
}

function categoryFor(symbol, { map, fallback }) {
  return map[symbol] || fallback;
}

const MONTHS = { Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12 };

// Brokerage exports stamp a "Date downloaded ..." footer line - this is the
// one honest way to know how stale the holdings/transactions snapshot is,
// independent of when the build itself ran (live prices can be fresh while
// share counts are weeks old).
function extractDownloadedDate(text) {
  const m = /Date downloaded\s+([A-Za-z0-9\/\-: .]+?)\s*(?:ET)?"?\s*$/m.exec(text);
  if (!m) return { raw: null, iso: null };
  const raw = m[1].trim();
  let iso = null;
  let dm = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(raw);
  if (dm) iso = `${dm[3]}-${dm[1]}-${dm[2]}`;
  if (!iso) {
    dm = /^([A-Za-z]{3})-(\d{2})-(\d{4})/.exec(raw);
    if (dm && MONTHS[dm[1]]) iso = `${dm[3]}-${String(MONTHS[dm[1]]).padStart(2, '0')}-${dm[2]}`;
  }
  return { raw, iso };
}

function parsePositions(text, categories) {
  const rows = parseCsv(text);
  const positions = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 8) continue;
    const accountNumber = (row[0] || '').trim();
    if (!/^[A-Za-z0-9]{5,}$/.test(accountNumber)) continue; // skip blank/footer/disclaimer rows
    const accountName = (row[1] || '').trim();
    let symbol = (row[2] || '').trim();
    if (!symbol || symbol === 'Pending activity') continue;

    const description = (row[3] || '').trim();
    const quantity = money(row[4]);
    const lastPrice = money(row[5]);
    const lastPriceChange = money(row[6]);
    const currentValue = money(row[7]);
    const todayGainDollar = money(row[8]);
    const todayGainPercent = money(row[9]);
    const totalGainDollar = money(row[10]);
    const totalGainPercent = money(row[11]);
    const percentOfAccount = money(row[12]);
    const costBasisTotal = money(row[13]);
    const avgCostBasis = money(row[14]);

    const isCash = symbol.endsWith('**') || /MONEY MARKET|DEPOSIT SWEEP/i.test(description);
    if (isCash) symbol = symbol.replace(/\*+$/, '');

    const optionMatch = symbol.match(OPTION_RE);
    let isOption = false, underlying = null, optionDetails = null;
    if (optionMatch) {
      isOption = true;
      underlying = optionMatch[1];
      const [, , yy, mm, dd, type, strikeStr] = optionMatch;
      optionDetails = {
        underlying,
        expiration: `20${yy}-${mm}-${dd}`,
        type: type === 'P' ? 'put' : 'call',
        strike: parseFloat(strikeStr),
        contracts: quantity,
        direction: (quantity ?? 0) < 0 ? 'short' : 'long',
      };
    }

    const category = isCash ? 'Cash' : categoryFor(isOption ? underlying : symbol, categories);

    positions.push({
      accountNumber, accountName, symbol, description, quantity, lastPrice, lastPriceChange, currentValue,
      todayGainDollar: todayGainDollar || 0, todayGainPercent,
      totalGainDollar, totalGainPercent, percentOfAccount, costBasisTotal, avgCostBasis,
      isCash, isOption, optionDetails, category,
    });
  }
  return positions;
}

function parseDateMDY(s) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s || '');
  if (!m) return null;
  const [, mm, dd, yyyy] = m;
  return { iso: `${yyyy}-${mm}-${dd}`, monthKey: `${yyyy}-${mm}` };
}

function parseTransactions(text) {
  const rows = parseCsv(text);
  const income = {
    dividends: { byTicker: {}, byMonth: {}, total: 0, entries: [] },
    returnOfCapital: { byTicker: {}, total: 0 },
    interest: { total: 0 },
    optionPremium: { byTicker: {}, total: 0, entries: [] },
    assignments: [],
    fees: 0,
    contributions: 0,
  };
  let minDate = null, maxDate = null;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 8) continue;
    const runDate = (row[0] || '').trim();
    const parsedDate = parseDateMDY(runDate);
    if (!parsedDate) continue; // skip footer/blank rows

    if (!minDate || parsedDate.iso < minDate) minDate = parsedDate.iso;
    if (!maxDate || parsedDate.iso > maxDate) maxDate = parsedDate.iso;

    const action = (row[3] || '').trim();
    let symbol = (row[4] || '').trim();
    const amount = money(row[12]);
    const amt = amount ?? 0;

    const optionMatch = symbol.match(OPTION_RE);

    if (optionMatch) {
      const underlying = optionMatch[1];
      const isAssignment = /ASSIGNED/i.test(action);
      if (!isAssignment && amt !== 0) {
        income.optionPremium.byTicker[underlying] = (income.optionPremium.byTicker[underlying] || 0) + amt;
        income.optionPremium.total += amt;
        income.optionPremium.entries.push({ date: parsedDate.iso, underlying, action, amount: amt });
      }
      continue;
    }

    if (/DIVIDEND RECEIVED/i.test(action)) {
      income.dividends.byTicker[symbol] = (income.dividends.byTicker[symbol] || 0) + amt;
      income.dividends.byMonth[parsedDate.monthKey] = (income.dividends.byMonth[parsedDate.monthKey] || 0) + amt;
      income.dividends.total += amt;
      income.dividends.entries.push({ date: parsedDate.iso, symbol, amount: amt });
      continue;
    }
    if (/RETURN OF CAPITAL/i.test(action)) {
      income.returnOfCapital.byTicker[symbol] = (income.returnOfCapital.byTicker[symbol] || 0) + amt;
      income.returnOfCapital.total += amt;
      continue;
    }
    if (/INTEREST EARNED/i.test(action)) {
      income.interest.total += amt;
      continue;
    }
    if (/ASSIGNED (PUTS|CALLS)/i.test(action)) {
      income.assignments.push({ date: parsedDate.iso, symbol, action, amount: amt });
      continue;
    }
    if (/FEE CHARGED/i.test(action)) {
      income.fees += amt;
      continue;
    }
    if (/DIRECT DEPOSIT/i.test(action)) {
      income.contributions += amt;
      continue;
    }
    // else: ordinary trades, reinvestment sweeps, cash advances - not income, ignored here
  }

  return { income, window: { from: minDate, to: maxDate } };
}

function aggregateHoldings(positions) {
  const byTicker = new Map();
  for (const p of positions) {
    if (p.isOption) continue;
    const key = p.symbol;
    if (!byTicker.has(key)) {
      byTicker.set(key, {
        symbol: key, description: p.description, category: p.category, isCash: p.isCash,
        quantity: 0, currentValue: 0, costBasisTotal: 0, todayGainDollar: 0, accounts: [],
      });
    }
    const h = byTicker.get(key);
    h.quantity += p.quantity || 0;
    h.currentValue += p.currentValue || 0;
    h.costBasisTotal += p.costBasisTotal || 0;
    h.todayGainDollar += p.todayGainDollar || 0;
    h.accounts.push({ account: p.accountName, quantity: p.quantity, currentValue: p.currentValue });
  }
  const holdings = [...byTicker.values()];
  for (const h of holdings) {
    const startOfDayValue = h.currentValue - h.todayGainDollar;
    h.todayGainPercent = startOfDayValue !== 0 ? (h.todayGainDollar / startOfDayValue) * 100 : null;
  }
  return holdings;
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function categoryTotals(positions) {
  const totals = {};
  for (const p of positions) {
    totals[p.category] = (totals[p.category] || 0) + (p.currentValue || 0);
  }
  return totals;
}

// Per-category performance: today's move and total return vs. cost basis -
// answers "what is each sector doing", not just "how big is it" (the donut).
function categoryPerformance(positions) {
  const byCategory = new Map();
  for (const p of positions) {
    if (!byCategory.has(p.category)) {
      byCategory.set(p.category, { category: p.category, value: 0, costBasis: 0, todayGainDollar: 0 });
    }
    const c = byCategory.get(p.category);
    c.value += p.currentValue || 0;
    c.costBasis += p.costBasisTotal ?? p.currentValue ?? 0; // cash has no cost basis - treat as flat (0% return)
    c.todayGainDollar += p.todayGainDollar || 0;
  }
  return [...byCategory.values()].map((c) => ({
    ...c,
    totalGainDollar: c.value - c.costBasis,
    totalGainPercent: c.costBasis ? ((c.value - c.costBasis) / c.costBasis) * 100 : null,
    todayGainPercent: (c.value - c.todayGainDollar) !== 0 ? (c.todayGainDollar / (c.value - c.todayGainDollar)) * 100 : null,
  }));
}

function topMovers(holdings, n = 5) {
  const withMove = holdings.filter((h) => !h.isCash && typeof h.todayGainPercent === 'number');
  const sorted = [...withMove].sort((a, b) => b.todayGainPercent - a.todayGainPercent);
  return {
    gainers: sorted.slice(0, n),
    losers: sorted.slice(-n).reverse().filter((h) => h.todayGainPercent < 0),
  };
}

async function main() {
  const pin = process.env.DASHBOARD_PIN;
  if (!pin) {
    console.error('DASHBOARD_PIN env var is required (never committed to the repo).');
    process.exit(1);
  }
  const skipLive = process.env.SKIP_LIVE_PRICES === '1';

  const categories = readCategories();
  const positionsText = decryptJSON(readJson(path.join(ROOT, 'data/positions_raw.enc.json')), pin).csv;
  const transactionsText = decryptJSON(readJson(path.join(ROOT, 'data/transactions_raw.enc.json')), pin).csv;
  const plan = JSON.parse(decryptJSON(readJson(path.join(ROOT, 'data/plan.enc.json')), pin).json);
  const thresholds = readJson(path.join(ROOT, 'data/thresholds.json'));

  const positions = parsePositions(positionsText, categories);
  const { income, window } = parseTransactions(transactionsText);
  const holdingsAsOf = extractDownloadedDate(positionsText);
  const transactionsAsOf = extractDownloadedDate(transactionsText);

  const stockTickers = [...new Set(positions.filter((p) => !p.isCash && !p.isOption).map((p) => p.symbol))];
  const quotes = skipLive ? new Map() : await fetchQuotes(stockTickers);

  let liveCount = 0, fallbackCount = 0;
  for (const p of positions) {
    if (p.isCash || p.isOption) continue;
    const q = quotes.get(p.symbol);
    if (q && typeof q.price === 'number') {
      p.currentValue = q.price * (p.quantity || 0);
      p.lastPrice = q.price;
      p.priceSource = q.source;
      p.priceAsOf = q.asOf;
      if (typeof q.previousClose === 'number' && q.previousClose > 0) {
        p.todayGainDollar = (q.price - q.previousClose) * (p.quantity || 0);
        p.todayGainPercent = (q.price / q.previousClose - 1) * 100;
      }
      liveCount++;
    } else {
      p.priceSource = 'export';
      fallbackCount++;
    }
  }

  const holdings = aggregateHoldings(positions);
  const catTotals = categoryTotals(positions);
  const catPerformance = categoryPerformance(positions);
  const movers = topMovers(holdings);
  const totalValue = Object.values(catTotals).reduce((a, b) => a + b, 0);
  const totalStockCostBasis = holdings.filter((h) => !h.isCash).reduce((a, h) => a + (h.costBasisTotal || 0), 0);
  const totalStockValue = holdings.filter((h) => !h.isCash).reduce((a, h) => a + (h.currentValue || 0), 0);
  const totalTodayGainDollar = positions.reduce((a, p) => a + (p.todayGainDollar || 0), 0);
  const totalTodayGainPercent = (totalValue - totalTodayGainDollar) !== 0
    ? (totalTodayGainDollar / (totalValue - totalTodayGainDollar)) * 100 : null;

  const options = positions.filter((p) => p.isOption).map((p) => ({
    symbol: p.symbol, description: p.description, accountName: p.accountName,
    ...p.optionDetails, currentValue: p.currentValue, costBasisTotal: p.costBasisTotal,
  }));

  const today = new Date().toISOString().slice(0, 10);
  const bundlePath = path.join(ROOT, 'site/data/bundle.enc.json');
  let history = [];
  if (fs.existsSync(bundlePath)) {
    try {
      const prevBundle = JSON.parse(fs.readFileSync(bundlePath, 'utf8'));
      const prevData = decryptJSON(prevBundle, pin);
      history = prevData.history || [];
    } catch (e) {
      console.error('Could not decrypt previous bundle with the provided PIN — starting fresh history.', e.message);
    }
  }
  history = history.filter((h) => h.date !== today);
  history.push({ date: today, totalValue, totalStockCostBasis, totalStockValue, byCategory: catTotals });
  history.sort((a, b) => a.date.localeCompare(b.date));

  const data = {
    generatedAt: new Date().toISOString(),
    priceRefresh: { live: liveCount, fallback: fallbackCount },
    holdingsAsOf, transactionsAsOf,
    accounts: [...new Set(positions.map((p) => p.accountName))],
    holdings,
    options,
    categoryTotals: catTotals,
    categoryPerformance: catPerformance,
    topMovers: movers,
    totalValue,
    totalTodayGainDollar,
    totalTodayGainPercent,
    totalStockCostBasis,
    totalStockValue,
    income: { ...income, window },
    history,
    plan,
    thresholds,
  };

  const bundle = encryptJSON(data, pin);
  fs.mkdirSync(path.join(ROOT, 'site/data'), { recursive: true });
  fs.writeFileSync(bundlePath, JSON.stringify(bundle));
  fs.writeFileSync(
    path.join(ROOT, 'site/data/meta.json'),
    JSON.stringify({ generatedAt: data.generatedAt, priceRefresh: data.priceRefresh }, null, 2)
  );

  console.log(`Built bundle: total value $${totalValue.toFixed(2)}, ${liveCount} live prices, ${fallbackCount} fallback prices, ${holdings.length} holdings, history points: ${history.length}`);
}

main();

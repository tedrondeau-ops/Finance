// Live quote fetch with graceful fallback. Uses Yahoo Finance's public chart
// endpoint (no API key required). If a ticker can't be fetched (network block,
// delisted, rate limit), the caller falls back to the last-known price from
// the brokerage export so the build never fails outright.
export async function fetchQuote(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; portfolio-dashboard-build/1.0)' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    const price = result?.meta?.regularMarketPrice;
    const prevClose = result?.meta?.previousClose ?? result?.meta?.chartPreviousClose;
    if (typeof price !== 'number') return null;
    return {
      price,
      previousClose: typeof prevClose === 'number' ? prevClose : null,
      asOf: result?.meta?.regularMarketTime ? new Date(result.meta.regularMarketTime * 1000).toISOString() : null,
      source: 'yahoo',
    };
  } catch {
    return null;
  }
}

export async function fetchQuotes(symbols, { concurrency = 6 } = {}) {
  const results = new Map();
  const queue = [...symbols];
  async function worker() {
    while (queue.length) {
      const symbol = queue.shift();
      const quote = await fetchQuote(symbol);
      results.set(symbol, quote);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}

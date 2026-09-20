# Portfolio Dashboard

A private, static, PIN-gated dashboard for tracking this portfolio: current
positions, allocation by category, dividend + cash-secured-put income, and
value over time — hosted free on GitHub Pages, viewable from a phone.

## One-time setup

1. **Enable Pages**: repo Settings → Pages → Source: **GitHub Actions**.
2. **Add the PIN secret**: repo Settings → Secrets and variables → Actions →
   New repository secret → name it `DASHBOARD_PIN`, value is your chosen PIN
   (the same one you'll type into the dashboard to unlock it). This secret is
   the only thing that can decrypt the data — Anthropic/Claude never stores it.
3. **Run the workflow once**: Actions tab → "Rebuild dashboard and deploy to
   Pages" → Run workflow. After it finishes, your dashboard URL is shown
   under Settings → Pages (something like
   `https://<username>.github.io/Finance/`). Add it to your phone's home
   screen for an app-like icon.
4. It also reruns automatically every weekday after market close, refreshing
   prices and appending one point to the value-over-time chart.

## How this stays private on free GitHub Pages

Pages sites on a free account are reachable by anyone with the URL — there's
no login wall. So every file containing real numbers (positions, transaction
history, plan notes, and the published dashboard data) is **encrypted at
rest** with AES-256-GCM, keyed from your PIN via PBKDF2. The only plaintext
financial file in the repo is `data/categories.json` (ticker → category
labels — no dollar amounts). Be honest with yourself about the ceiling here:
a 4-digit PIN is 10,000 combinations, so this stops casual discovery and
scraping, not a determined attacker who gets hold of the repo. Use a longer
PIN (update the `DASHBOARD_PIN` secret, then re-run `encrypt-source.mjs`
locally and the workflow) if you want more than that.

## Updating your holdings (the ongoing workflow)

Since the raw brokerage exports are sensitive, **never paste them directly
into GitHub's web editor** — that would put plaintext account data in the
repo. Instead, whenever you have a new export:

1. Start a Claude Code session on this repo (web, desktop, or CLI).
2. Attach your latest "Positions" and "Accounts History" CSV exports from
   your brokerage.
3. Ask Claude to refresh the dashboard data, and give it the PIN when asked.

Claude will decrypt the previous source files if needed, replace them with
the new export, re-encrypt, and push — the next scheduled run (or a manual
one) picks up the change. Live prices refresh daily on their own regardless;
only the share counts/cost basis/transaction history need this manual
refresh, because that's account data only you have.

## Repo layout

```
data/
  categories.json          ticker -> category, plaintext, edit anytime
  positions_raw.enc.json   encrypted brokerage positions export
  transactions_raw.enc.json  encrypted brokerage transaction history export
  plan.enc.json            encrypted rotation/allocation plan notes
scripts/
  build.mjs                parses the encrypted sources, fetches live prices,
                           computes holdings/income, writes the encrypted
                           bundle the dashboard reads
  encrypt-source.mjs       re-encrypts data/*_raw.csv + plan.json after you
                           update them locally (used during a Claude session)
  crypto.mjs, csv.mjs, prices.mjs   supporting helpers
site/                      the published static dashboard (GitHub Pages root)
  index.html               overview: total value, allocation, holdings
  income.html              dividends, cash-secured put premium, assignments
  data/bundle.enc.json     the one encrypted data file the pages fetch
.github/workflows/         daily rebuild + Pages deploy
```

## Known limitations / things to sanity-check

- **Categories are a first pass** Claude assigned from your holdings —
  review `data/categories.json` and adjust; it's a plain ticker → label map.
- **"CCPs" in this portfolio are cash-secured puts, not covered calls** —
  there were no open covered calls in the export used to build this. The
  Income page's options table is short puts only.
- **Income run-rate is an extrapolation**, not a real trailing-twelve-month
  number, until roughly a year of transaction history has flowed through —
  the page says how many days of history it's based on.
- **Live prices** come from an unofficial, free, no-key quote endpoint. If a
  ticker can't be fetched (rate limit, delisted, etc.) the dashboard falls
  back to the last known price from your export rather than failing; the
  overview page shows how many prices were live vs. fallback on each build.
- **Options aren't priced live** — only the underlying stock's current price
  is fetched, which is enough to flag assignment risk (price vs. strike)
  without pulling a full options chain.

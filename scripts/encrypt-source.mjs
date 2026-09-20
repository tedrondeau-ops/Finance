// Encrypts the sensitive local source files (raw brokerage exports + plan notes)
// so the plaintext versions never enter git history. Run this locally whenever
// you update data/positions_raw.csv, data/transactions_raw.csv, or data/plan.json,
// then commit the resulting *.enc.json files (the plaintext originals are gitignored).
import fs from 'node:fs';
import path from 'node:path';
import { encryptJSON } from './crypto.mjs';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '..');

function encryptFile(plainPath, encPath, wrapKey) {
  if (!fs.existsSync(plainPath)) {
    console.log(`skip (not found): ${plainPath}`);
    return;
  }
  const content = fs.readFileSync(plainPath, 'utf8');
  const bundle = encryptJSON({ [wrapKey]: content }, process.env.DASHBOARD_PIN);
  fs.writeFileSync(encPath, JSON.stringify(bundle));
  console.log(`encrypted ${plainPath} -> ${encPath}`);
}

function main() {
  if (!process.env.DASHBOARD_PIN) {
    console.error('DASHBOARD_PIN env var is required.');
    process.exit(1);
  }
  encryptFile(path.join(ROOT, 'data/positions_raw.csv'), path.join(ROOT, 'data/positions_raw.enc.json'), 'csv');
  encryptFile(path.join(ROOT, 'data/transactions_raw.csv'), path.join(ROOT, 'data/transactions_raw.enc.json'), 'csv');
  encryptFile(path.join(ROOT, 'data/plan.json'), path.join(ROOT, 'data/plan.enc.json'), 'json');
}

main();

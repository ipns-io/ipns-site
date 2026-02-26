#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { computeReconciliation, loadState } from './lib/registrationMonitor.mjs';

const statePath = process.env.REG_NOTIFY_STATE_PATH || 'scripts/state/registration-events.json';
const hours = Number(process.env.RECON_HOURS || 24);
const outDir = process.env.RECON_REPORT_DIR || 'scripts/reports';

const state = await loadState(statePath);
const report = {
  generatedAt: new Date().toISOString(),
  statePath,
  ...computeReconciliation(state, hours, Date.now())
};

await fs.mkdir(outDir, { recursive: true });
const dayStamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const reportPath = path.join(outDir, `registration-reconciliation-${dayStamp}.json`);
await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

console.log(JSON.stringify({
  reportPath,
  report
}, null, 2));

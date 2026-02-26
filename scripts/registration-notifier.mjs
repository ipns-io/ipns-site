#!/usr/bin/env node
import http from 'node:http';
import { URL } from 'node:url';
import { createRegistrationMonitor, DEFAULT_CONTRACT, DEFAULT_DEPLOY_BLOCK, DEFAULT_TOPIC_REGISTER } from './lib/registrationMonitor.mjs';

const config = {
  rpcUrl: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
  contract: process.env.CONTRACT_ADDRESS || DEFAULT_CONTRACT,
  topicRegister: process.env.TOPIC_REGISTER || DEFAULT_TOPIC_REGISTER,
  deployBlock: Number(process.env.DEPLOY_BLOCK || DEFAULT_DEPLOY_BLOCK),
  statePath: process.env.REG_NOTIFY_STATE_PATH || 'scripts/state/registration-events.json',
  blockChunk: Number(process.env.REG_NOTIFY_BLOCK_CHUNK || 2000),
  pollMs: Number(process.env.REG_NOTIFY_POLL_MS || 15000),
  discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL || '',
  slackWebhookUrl: process.env.SLACK_WEBHOOK_URL || '',
  analyticsSharedSecret: process.env.ANALYTICS_SHARED_SECRET || ''
};

const monitor = createRegistrationMonitor(config);

async function pollAndLog() {
  try {
    const result = await monitor.pollOnce();
    if (result.processed > 0) {
      console.log(JSON.stringify({
        type: 'registration_notifier',
        ts: new Date().toISOString(),
        processed: result.processed,
        deduped: result.deduped,
        latestBlock: result.latestBlock,
        notifications: result.notifications
      }, null, 2));
    }
  } catch (err) {
    console.error(JSON.stringify({
      type: 'registration_notifier_error',
      ts: new Date().toISOString(),
      error: String(err && err.message ? err.message : err)
    }));
  }
}

function sendJson(res, status, body) {
  const text = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  });
  res.end(text);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1024 * 1024) {
        reject(new Error('body too large'));
      }
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(new Error('invalid json body'));
      }
    });
    req.on('error', reject);
  });
}

async function startServer() {
  const port = Number(process.env.REG_NOTIFY_PORT || 8788);
  const server = http.createServer(async (req, res) => {
    try {
      const method = req.method || 'GET';
      const reqUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

      if (method === 'GET' && reqUrl.pathname === '/health') {
        return sendJson(res, 200, { ok: true, service: 'registration-notifier' });
      }

      if (method === 'GET' && reqUrl.pathname === '/registrations/recent') {
        const limit = Number(reqUrl.searchParams.get('limit') || 50);
        const events = await monitor.getRecentRegistrations(limit);
        return sendJson(res, 200, { events });
      }

      if (method === 'GET' && reqUrl.pathname === '/registrations/reconciliation') {
        const hours = Number(reqUrl.searchParams.get('hours') || 24);
        const report = await monitor.getReconciliation(hours);
        return sendJson(res, 200, report);
      }

      if (method === 'POST' && reqUrl.pathname === '/analytics/register_tx_confirmed') {
        if (config.analyticsSharedSecret) {
          const provided = String(req.headers['x-analytics-secret'] || '');
          if (provided !== config.analyticsSharedSecret) {
            return sendJson(res, 401, { error: 'unauthorized' });
          }
        }
        const body = await readJsonBody(req);
        await monitor.recordAnalyticsEvent(body);
        return sendJson(res, 202, { ok: true });
      }

      sendJson(res, 404, { error: 'not_found' });
    } catch (err) {
      sendJson(res, 400, { error: String(err && err.message ? err.message : err) });
    }
  });

  await new Promise((resolve) => server.listen(port, resolve));
  console.log(JSON.stringify({ type: 'registration_notifier_server_started', port, statePath: config.statePath }));
}

await pollAndLog();
setInterval(pollAndLog, config.pollMs);
startServer();

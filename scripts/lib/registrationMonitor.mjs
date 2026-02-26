import fs from 'node:fs/promises';
import path from 'node:path';

export const DEFAULT_CONTRACT = '0x1bbE8783884C23e1bf02F1221291696798002d8a';
export const DEFAULT_TOPIC_REGISTER = '0xea643006918922450ebbe2e11853b7310fb95e06dfc5b23b0e2a397f045757eb';
export const DEFAULT_DEPLOY_BLOCK = 42383643;

function toHexNumber(value) {
  return `0x${Number(value).toString(16)}`;
}

function hexToBigInt(hex) {
  return BigInt(hex || '0x0');
}

function hexWord(dataHex, index) {
  const clean = (dataHex || '').startsWith('0x') ? dataHex.slice(2) : (dataHex || '');
  return clean.slice(index * 64, (index + 1) * 64);
}

function decodeDynamicString(dataHex, offsetBytes) {
  const clean = dataHex.startsWith('0x') ? dataHex.slice(2) : dataHex;
  const start = Number(offsetBytes) * 2;
  const lenHex = clean.slice(start, start + 64);
  const len = Number(BigInt(`0x${lenHex || '0'}`));
  const body = clean.slice(start + 64, start + 64 + (len * 2));
  const bytes = body.match(/.{1,2}/g)?.map((h) => parseInt(h, 16)) || [];
  return new TextDecoder().decode(new Uint8Array(bytes));
}

function normalizeOwner(topic) {
  const clean = (topic || '').toLowerCase().replace(/^0x/, '');
  if (!clean) return '';
  return `0x${clean.slice(-40)}`;
}

function buildDedupeKey(log) {
  const txHash = (log.transactionHash || '').toLowerCase();
  const logIndex = Number(hexToBigInt(log.logIndex || '0x0'));
  return `${txHash}:${logIndex}`;
}

function parseRegisteredLog(log) {
  const data = log.data || '0x';
  const displayOffset = Number(hexToBigInt(`0x${hexWord(data, 0) || '0'}`));
  const displayName = decodeDynamicString(data, displayOffset);
  const owner = normalizeOwner(log.topics?.[2]);
  return {
    dedupeKey: buildDedupeKey(log),
    name: displayName,
    owner,
    txHash: (log.transactionHash || '').toLowerCase(),
    blockNumber: Number(hexToBigInt(log.blockNumber || '0x0')),
    logIndex: Number(hexToBigInt(log.logIndex || '0x0'))
  };
}

async function ensureDir(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

export async function loadState(statePath) {
  try {
    const raw = await fs.readFile(statePath, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      lastProcessedBlock: Number(parsed.lastProcessedBlock || 0),
      seen: Array.isArray(parsed.seen) ? parsed.seen : [],
      events: Array.isArray(parsed.events) ? parsed.events : [],
      analytics: Array.isArray(parsed.analytics) ? parsed.analytics : []
    };
  } catch {
    return {
      lastProcessedBlock: 0,
      seen: [],
      events: [],
      analytics: []
    };
  }
}

export async function saveState(statePath, state) {
  await ensureDir(statePath);
  const tmp = `${statePath}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(state, null, 2));
  await fs.rename(tmp, statePath);
}

function keepRecent(items, maxItems = 1000) {
  if (items.length <= maxItems) return items;
  return items.slice(items.length - maxItems);
}

function filterSince(items, cutoffMs, timeField) {
  return items.filter((item) => {
    const t = new Date(item[timeField]).getTime();
    return Number.isFinite(t) && t >= cutoffMs;
  });
}

export function computeReconciliation(state, hours = 24, nowMs = Date.now()) {
  const windowMs = Math.max(1, Number(hours)) * 60 * 60 * 1000;
  const cutoffMs = nowMs - windowMs;
  const onchain = filterSince(state.events, cutoffMs, 'blockTime');
  const analytics = filterSince(state.analytics, cutoffMs, 'receivedAt');
  const onchainCount = onchain.length;
  const analyticsCount = analytics.length;
  const mismatch = onchainCount === 0
    ? (analyticsCount === 0 ? 0 : 100)
    : Math.abs(onchainCount - analyticsCount) / onchainCount * 100;

  return {
    windowHours: Number(hours),
    onchainRegistrations24h: onchainCount,
    analyticsRegisterTxConfirmed24h: analyticsCount,
    mismatchPercentage: Number(mismatch.toFixed(2))
  };
}

async function rpcCall(rpcUrl, method, params, fetchImpl) {
  const res = await fetchImpl(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params })
  });
  if (!res.ok) {
    throw new Error(`rpc ${method} failed: HTTP ${res.status}`);
  }
  const json = await res.json();
  if (json.error) {
    throw new Error(`rpc ${method} error: ${json.error.message || 'unknown'}`);
  }
  return json.result;
}

async function fetchLogsRange({ rpcUrl, contract, topic, fromBlock, toBlock, fetchImpl }) {
  if (fromBlock > toBlock) return [];
  return rpcCall(rpcUrl, 'eth_getLogs', [{
    address: contract,
    fromBlock: toHexNumber(fromBlock),
    toBlock: toHexNumber(toBlock),
    topics: [topic]
  }], fetchImpl);
}

async function fetchBlockTimestamp(rpcUrl, blockNumber, fetchImpl, cache) {
  if (cache.has(blockNumber)) return cache.get(blockNumber);
  const block = await rpcCall(rpcUrl, 'eth_getBlockByNumber', [toHexNumber(blockNumber), false], fetchImpl);
  const timestamp = new Date(Number(hexToBigInt(block.timestamp || '0x0')) * 1000).toISOString();
  cache.set(blockNumber, timestamp);
  return timestamp;
}

async function postJson(url, body, fetchImpl) {
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`webhook ${url} failed: HTTP ${res.status} ${text}`);
  }
}

async function sendNotifications(payload, options) {
  const jobs = [];
  const baseText = `ipns registration: ${payload.name}.ipns.io owner=${payload.owner} tx=${payload.txHash}`;

  if (options.discordWebhookUrl) {
    jobs.push(postJson(options.discordWebhookUrl, {
      content: `${baseText}\n${payload.url}`,
      embeds: [{
        title: 'New ipns.io registration',
        fields: [
          { name: 'name', value: payload.name, inline: true },
          { name: 'owner', value: payload.owner, inline: false },
          { name: 'txHash', value: payload.txHash, inline: false },
          { name: 'blockTime', value: payload.blockTime, inline: true },
          { name: 'url', value: payload.url, inline: false }
        ]
      }]
    }, options.fetchImpl));
  }

  if (options.slackWebhookUrl) {
    jobs.push(postJson(options.slackWebhookUrl, {
      text: `${baseText} ${payload.url}`,
      blocks: [{
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*New ipns.io registration*\n*name:* ${payload.name}\n*owner:* ${payload.owner}\n*txHash:* ${payload.txHash}\n*blockTime:* ${payload.blockTime}\n*url:* ${payload.url}`
        }
      }]
    }, options.fetchImpl));
  }

  if (jobs.length === 0) return [];
  return Promise.allSettled(jobs);
}

export function createRegistrationMonitor(config) {
  const fetchImpl = config.fetchImpl || fetch;
  const rpcUrl = config.rpcUrl;
  const contract = (config.contract || DEFAULT_CONTRACT).toLowerCase();
  const topic = (config.topicRegister || DEFAULT_TOPIC_REGISTER).toLowerCase();
  const deployBlock = Number(config.deployBlock || DEFAULT_DEPLOY_BLOCK);
  const statePath = config.statePath;
  const blockChunk = Number(config.blockChunk || 2000);

  async function pollOnce() {
    const state = await loadState(statePath);
    const seenSet = new Set(state.seen);
    const latestBlock = Number(hexToBigInt(await rpcCall(rpcUrl, 'eth_blockNumber', [], fetchImpl)));
    const fromBlock = Math.max(deployBlock, Number(state.lastProcessedBlock || 0) + 1);

    if (fromBlock > latestBlock) {
      return { processed: 0, deduped: 0, latestBlock, notifications: [] };
    }

    let processed = 0;
    let deduped = 0;
    const notifications = [];
    const blockTimeCache = new Map();

    for (let start = fromBlock; start <= latestBlock; start += blockChunk) {
      const end = Math.min(start + blockChunk - 1, latestBlock);
      const logs = await fetchLogsRange({
        rpcUrl,
        contract,
        topic,
        fromBlock: start,
        toBlock: end,
        fetchImpl
      });

      for (const log of logs) {
        const decoded = parseRegisteredLog(log);
        if (!decoded.name || !decoded.txHash) continue;
        if (seenSet.has(decoded.dedupeKey)) {
          deduped += 1;
          continue;
        }

        const blockTime = await fetchBlockTimestamp(rpcUrl, decoded.blockNumber, fetchImpl, blockTimeCache);
        const payload = {
          name: decoded.name,
          owner: decoded.owner,
          txHash: decoded.txHash,
          blockTime,
          url: `https://${decoded.name.toLowerCase()}.ipns.io`
        };

        await sendNotifications(payload, {
          fetchImpl,
          discordWebhookUrl: config.discordWebhookUrl,
          slackWebhookUrl: config.slackWebhookUrl
        });

        state.events.push({
          ...payload,
          dedupeKey: decoded.dedupeKey,
          blockNumber: decoded.blockNumber,
          logIndex: decoded.logIndex
        });
        seenSet.add(decoded.dedupeKey);
        processed += 1;
        notifications.push(payload);
      }
    }

    state.lastProcessedBlock = latestBlock;
    state.seen = Array.from(seenSet);
    state.events = keepRecent(state.events, Number(config.maxEvents || 1000));
    state.analytics = keepRecent(state.analytics, Number(config.maxAnalytics || 5000));
    await saveState(statePath, state);

    return { processed, deduped, latestBlock, notifications };
  }

  async function recordAnalyticsEvent(event) {
    const required = ['name', 'owner', 'txHash'];
    for (const key of required) {
      if (!event || typeof event[key] !== 'string' || event[key].trim() === '') {
        throw new Error(`analytics event missing field: ${key}`);
      }
    }

    const state = await loadState(statePath);
    state.analytics.push({
      name: event.name,
      owner: event.owner.toLowerCase(),
      txHash: event.txHash.toLowerCase(),
      receivedAt: event.receivedAt || new Date().toISOString()
    });
    state.analytics = keepRecent(state.analytics, Number(config.maxAnalytics || 5000));
    await saveState(statePath, state);
    return { ok: true };
  }

  async function getRecentRegistrations(limit = 50) {
    const state = await loadState(statePath);
    const n = Math.max(1, Math.min(50, Number(limit) || 50));
    return state.events.slice(-n).reverse();
  }

  async function getReconciliation(hours = 24) {
    const state = await loadState(statePath);
    return computeReconciliation(state, hours, Date.now());
  }

  return {
    pollOnce,
    recordAnalyticsEvent,
    getRecentRegistrations,
    getReconciliation,
    loadState: () => loadState(statePath)
  };
}

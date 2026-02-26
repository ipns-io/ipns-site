#!/usr/bin/env node
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createRegistrationMonitor } from './lib/registrationMonitor.mjs';

function pad32(hex) {
  return hex.replace(/^0x/, '').padStart(64, '0');
}

function strHex(str) {
  return Buffer.from(str, 'utf8').toString('hex');
}

function encodeNameRegisteredData(displayName, expires) {
  const offsetWord = pad32('40');
  const expiresWord = pad32(BigInt(expires).toString(16));
  const bytesHex = strHex(displayName);
  const lenWord = pad32((bytesHex.length / 2).toString(16));
  const paddedLen = Math.ceil((bytesHex.length / 2) / 32) * 64;
  const bodyWord = bytesHex.padEnd(paddedLen, '0');
  return `0x${offsetWord}${expiresWord}${lenWord}${bodyWord}`;
}

const owner = '0x1234567890abcdef1234567890abcdef12345678';
const txHash = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const mockLog = {
  address: '0x1bbE8783884C23e1bf02F1221291696798002d8a',
  topics: [
    '0xea643006918922450ebbe2e11853b7310fb95e06dfc5b23b0e2a397f045757eb',
    '0x1111111111111111111111111111111111111111111111111111111111111111',
    `0x000000000000000000000000${owner.slice(2)}`
  ],
  data: encodeNameRegisteredData('alice', 1777777777),
  blockNumber: '0x2ee0f20',
  transactionHash: txHash,
  transactionIndex: '0x0',
  logIndex: '0x0'
};

const captured = {
  discord: [],
  slack: [],
  getLogsCalls: 0
};
const nowTimestampHex = `0x${Math.floor(Date.now() / 1000).toString(16)}`;

const fetchImpl = async (url, init = {}) => {
  if (url === 'mock://rpc') {
    const body = JSON.parse(init.body || '{}');
    if (body.method === 'eth_blockNumber') {
      return Response.json({ jsonrpc: '2.0', id: body.id, result: '0x2ee0f20' });
    }
    if (body.method === 'eth_getLogs') {
      captured.getLogsCalls += 1;
      return Response.json({ jsonrpc: '2.0', id: body.id, result: captured.getLogsCalls === 1 ? [mockLog] : [] });
    }
    if (body.method === 'eth_getBlockByNumber') {
      return Response.json({ jsonrpc: '2.0', id: body.id, result: { timestamp: nowTimestampHex } });
    }
    return Response.json({ jsonrpc: '2.0', id: body.id, result: null });
  }

  if (url === 'mock://discord') {
    captured.discord.push(JSON.parse(init.body || '{}'));
    return new Response('', { status: 204 });
  }

  if (url === 'mock://slack') {
    captured.slack.push(JSON.parse(init.body || '{}'));
    return Response.json({ ok: true });
  }

  return new Response('not found', { status: 404 });
};

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ipns-regnotify-'));
const statePath = path.join(tmpDir, 'state.json');

const monitor = createRegistrationMonitor({
  rpcUrl: 'mock://rpc',
  statePath,
  deployBlock: 49155872,
  discordWebhookUrl: 'mock://discord',
  slackWebhookUrl: 'mock://slack',
  fetchImpl
});

const firstPoll = await monitor.pollOnce();
const monitorAfterRestart = createRegistrationMonitor({
  rpcUrl: 'mock://rpc',
  statePath,
  deployBlock: 49155872,
  discordWebhookUrl: 'mock://discord',
  slackWebhookUrl: 'mock://slack',
  fetchImpl
});
const secondPoll = await monitorAfterRestart.pollOnce();

assert.equal(firstPoll.processed, 1, 'first poll should process one event');
assert.equal(secondPoll.processed, 0, 'second poll should not process duplicate event');
assert.equal(captured.discord.length, 1, 'discord should receive exactly one notification');
assert.equal(captured.slack.length, 1, 'slack should receive exactly one notification');

const discordEmbedFields = captured.discord[0]?.embeds?.[0]?.fields || [];
const fieldMap = Object.fromEntries(discordEmbedFields.map((f) => [f.name, f.value]));
assert.ok(fieldMap.name, 'name field missing');
assert.ok(fieldMap.owner, 'owner field missing');
assert.ok(fieldMap.txHash, 'txHash field missing');
assert.ok(fieldMap.blockTime, 'blockTime field missing');
assert.ok(fieldMap.url, 'url field missing');

await monitor.recordAnalyticsEvent({
  name: 'alice',
  owner,
  txHash
});

const reconciliation = await monitor.getReconciliation(24);
assert.equal(reconciliation.onchainRegistrations24h, 1, 'onchain count should be 1');
assert.equal(reconciliation.analyticsRegisterTxConfirmed24h, 1, 'analytics count should be 1');
assert.equal(reconciliation.mismatchPercentage, 0, 'mismatch should be 0%');

const state = await monitor.loadState();
const analyticsEvidence = state.analytics[state.analytics.length - 1];
const notifierPayload = firstPoll.notifications[0];

console.log(JSON.stringify({
  status: 'pass',
  dedupeKeyFormat: `${txHash.toLowerCase()}:0`,
  restartPersistenceProof: {
    restartPollProcessed: secondPoll.processed,
    notificationsSentTotal: {
      discord: captured.discord.length,
      slack: captured.slack.length
    }
  },
  notifierPayload,
  analyticsEventEvidence: analyticsEvidence,
  reconciliation
}, null, 2));

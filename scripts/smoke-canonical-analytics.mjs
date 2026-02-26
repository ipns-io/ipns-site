const required = [
  "search_name",
  "check_availability",
  "register_tx_submitted",
  "register_tx_confirmed",
  "set_cid_tx_submitted",
  "set_cid_tx_confirmed",
  "resolve_success",
  "resolve_fail",
];

const commonKeys = [
  "event_id",
  "timestamp",
  "surface",
  "env",
  "session_id",
  "wallet",
  "name",
  "cid",
  "tx_hash",
  "chain_id",
  "request_id",
  "operation_id",
];

function randomId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function payload(surface, input = {}) {
  return {
    event_id: input.event_id || randomId(),
    timestamp: input.timestamp || new Date().toISOString(),
    surface,
    env: input.env || "test",
    session_id: input.session_id || randomId(),
    wallet: input.wallet || "",
    name: input.name || "",
    cid: input.cid || "",
    tx_hash: input.tx_hash || "",
    chain_id: input.chain_id || "8453",
    request_id: input.request_id || randomId(),
    operation_id: input.operation_id || randomId(),
  };
}

const output = [
  { event: "search_name", payload: payload("ipns.io", { name: "alice" }) },
  { event: "check_availability", payload: payload("ipns.io", { name: "alice" }) },
  { event: "register_tx_submitted", payload: payload("ipns.io", { name: "alice", wallet: "0xabc", tx_hash: "0xsub" }) },
  { event: "register_tx_confirmed", payload: payload("ipns.io", { name: "alice", wallet: "0xabc", tx_hash: "0xconf" }) },
  { event: "set_cid_tx_submitted", payload: payload("ipns.io", { name: "alice", cid: "bafybeialice", wallet: "0xabc", tx_hash: "0xsetsub" }) },
  { event: "set_cid_tx_confirmed", payload: payload("ipns.io", { name: "alice", cid: "bafybeialice", wallet: "0xabc", tx_hash: "0xsetconf" }) },
  { event: "resolve_success", payload: payload("cid.run", { name: "docs", cid: "bafybeidocs" }) },
  { event: "resolve_fail", payload: payload("cid.run", { name: "missing" }) },
].map((row) => ({ ...row, missing: commonKeys.filter((k) => !(k in row.payload)) }));

const matrix = required.map((name) => {
  const hit = output.find((r) => r.event === name);
  return { event: name, pass: Boolean(hit) && hit.missing.length === 0 };
});

console.log(JSON.stringify({ output, matrix }, null, 2));

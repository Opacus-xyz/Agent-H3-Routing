/**
 * @file discover.ts
 * @description Example: discover agents by H3 spatial proximity using ERC-8242.
 *              Demonstrates both on-chain `discoverAgents` pagination and off-chain
 *              event-based indexing.
 *
 * Install dependencies:
 *   npm install viem h3-js
 *
 * Usage:
 *   REGISTRY_ADDRESS=0x... npx ts-node examples/discover.ts
 */

import {
  createPublicClient,
  http,
  getContract,
  parseAbi,
  parseAbiItem,
  type Address,
} from "viem";
import { baseSepolia } from "viem/chains";

// ─── ABI ─────────────────────────────────────────────────────────────────────

const REGISTRY_ABI = parseAbi([
  "function discoverAgents(string h3Parent, uint8 resolution, uint8 preference, uint256 offset, uint256 limit) external view returns (tuple(address agent, string h3Index, uint8 resolution, uint8 preference, uint64 registeredAt, uint64 updatedAt)[] records, uint256 total)",
  "function totalRegistered() external view returns (uint256)",
  "event SpatialRegistered(address indexed agent, string h3Index, uint8 preference)",
]);

const ExecutionPreference = { Local: 0, Regional: 1, Global: 2 } as const;

// ─── Config ───────────────────────────────────────────────────────────────────

const REGISTRY_ADDRESS = process.env.REGISTRY_ADDRESS as Address;
const RPC_URL          = process.env.RPC_URL ?? "https://sepolia.base.org";

if (!REGISTRY_ADDRESS) {
  console.error("Set REGISTRY_ADDRESS environment variable.");
  process.exit(1);
}

const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(RPC_URL),
});

const registry = getContract({
  address: REGISTRY_ADDRESS,
  abi:     REGISTRY_ABI,
  client:  publicClient,
});

// ─── Discovery helpers ────────────────────────────────────────────────────────

/**
 * Fetch all pages of agents matching the given spatial filter.
 * Uses ERC-8242 `discoverAgents` with automatic pagination.
 */
async function fetchAllAgents(
  h3Parent:   string,
  resolution: number,
  preference: number,
  pageSize   = 50,
) {
  const results: Awaited<ReturnType<typeof registry.read.discoverAgents>>[0] = [];
  let offset = 0;

  while (true) {
    const [records, total] = await registry.read.discoverAgents([
      h3Parent,
      resolution,
      preference,
      BigInt(offset),
      BigInt(pageSize),
    ]);

    results.push(...records);
    offset += records.length;

    if (offset >= Number(total) || records.length === 0) break;
  }

  return results;
}

/**
 * Discover agents via past `SpatialRegistered` events (off-chain indexing approach).
 * Useful for retrieving the full registration history or building a local cache.
 */
async function fetchRegistrationEvents(fromBlock: bigint = 0n) {
  const logs = await publicClient.getLogs({
    address:   REGISTRY_ADDRESS,
    event:     parseAbiItem(
      "event SpatialRegistered(address indexed agent, string h3Index, uint8 preference)"
    ),
    fromBlock,
    toBlock:   "latest",
  });

  return logs.map((log) => ({
    agent:      log.args.agent,
    h3Index:    log.args.h3Index,
    preference: log.args.preference,
    blockNumber: log.blockNumber,
    txHash:      log.transactionHash,
  }));
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const total = await registry.read.totalRegistered();
  console.log(`Total registered agents: ${total}\n`);

  // ── 1. Discover all agents (no spatial filter) ───────────────────────────
  console.log("── All agents (no filter) ──────────────────────────────────");
  const allAgents = await fetchAllAgents("", 0, ExecutionPreference.Global);
  for (const rec of allAgents) {
    console.log(`  ${rec.agent}  h3=${rec.h3Index}  res=${rec.resolution}  pref=${["Local","Regional","Global"][rec.preference]}`);
  }

  // ── 2. Discover agents in a specific H3 parent cell at resolution 5 ──────
  const H3_PARENT = "8928308280"; // example parent prefix for resolution-5 search
  console.log(`\n── Agents in H3 parent "${H3_PARENT}" at resolution 5 ────────────`);
  const localAgents = await fetchAllAgents(H3_PARENT, 5, ExecutionPreference.Global);
  for (const rec of localAgents) {
    console.log(`  ${rec.agent}  h3=${rec.h3Index}`);
  }
  if (localAgents.length === 0) console.log("  (none found)");

  // ── 3. Discover Local-preference agents only ─────────────────────────────
  console.log("\n── Agents with Local preference ────────────────────────────");
  const localPrefAgents = await fetchAllAgents("", 0, ExecutionPreference.Local);
  for (const rec of localPrefAgents) {
    console.log(`  ${rec.agent}  h3=${rec.h3Index}  res=${rec.resolution}`);
  }
  if (localPrefAgents.length === 0) console.log("  (none found)");

  // ── 4. Event-based discovery (from block 0) ──────────────────────────────
  console.log("\n── SpatialRegistered events (from block 0) ─────────────────");
  const events = await fetchRegistrationEvents(0n);
  for (const ev of events) {
    console.log(`  block=${ev.blockNumber}  agent=${ev.agent}  h3=${ev.h3Index}  pref=${ev.preference}`);
  }
  if (events.length === 0) console.log("  (no events found)");
}

main().catch((err) => { console.error(err); process.exit(1); });

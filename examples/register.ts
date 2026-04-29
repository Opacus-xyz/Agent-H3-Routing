/**
 * @file register.ts
 * @description Example: register, update, and deregister an agent's H3 spatial identity
 *              using ERC-8242. Uses viem (v2) for Ethereum interaction.
 *
 * Install dependencies:
 *   npm install viem h3-js
 *
 * Usage:
 *   PRIVATE_KEY=0x... REGISTRY_ADDRESS=0x... npx ts-node examples/register.ts
 */

import {
  createWalletClient,
  createPublicClient,
  http,
  getContract,
  parseAbi,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains"; // swap for any supported chain

// ─── ABI (minimal – only the functions we need) ───────────────────────────────

const REGISTRY_ABI = parseAbi([
  "function registerSpatial(string h3Index, uint8 resolution, uint8 preference) external",
  "function updateSpatial(string h3Index, uint8 resolution, uint8 preference) external",
  "function deregisterSpatial() external",
  "function getSpatial(address agent) external view returns (tuple(address agent, string h3Index, uint8 resolution, uint8 preference, uint64 registeredAt, uint64 updatedAt))",
  "function isRegistered(address agent) external view returns (bool)",
  "event SpatialRegistered(address indexed agent, string h3Index, uint8 preference)",
  "event SpatialUpdated(address indexed agent, string h3Index, uint8 preference)",
  "event SpatialDeregistered(address indexed agent)",
]);

// ─── ExecutionPreference enum values ─────────────────────────────────────────

const ExecutionPreference = {
  Local:    0,
  Regional: 1,
  Global:   2,
} as const;

// ─── Config ───────────────────────────────────────────────────────────────────

const PRIVATE_KEY       = process.env.PRIVATE_KEY as `0x${string}`;
const REGISTRY_ADDRESS  = process.env.REGISTRY_ADDRESS as Address;
const RPC_URL           = process.env.RPC_URL ?? "https://sepolia.base.org";

if (!PRIVATE_KEY || !REGISTRY_ADDRESS) {
  console.error("Set PRIVATE_KEY and REGISTRY_ADDRESS environment variables.");
  process.exit(1);
}

// ─── Clients ──────────────────────────────────────────────────────────────────

const account = privateKeyToAccount(PRIVATE_KEY);

const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(RPC_URL),
});

const walletClient = createWalletClient({
  account,
  chain: baseSepolia,
  transport: http(RPC_URL),
});

const registry = getContract({
  address:        REGISTRY_ADDRESS,
  abi:            REGISTRY_ABI,
  client:         { public: publicClient, wallet: walletClient },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function preferenceLabel(n: number): string {
  return (["Local", "Regional", "Global"] as const)[n] ?? "Unknown";
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Agent address : ${account.address}`);
  console.log(`Registry      : ${REGISTRY_ADDRESS}\n`);

  // 1. Check current registration status
  const registered = await registry.read.isRegistered([account.address]);
  console.log(`Already registered: ${registered}`);

  if (!registered) {
    // 2. Register at resolution 5 (~252 km² cell) with Local preference
    const h3Index    = "8928308280fffff"; // Replace with the agent's actual H3 cell
    const resolution = 5;
    const preference = ExecutionPreference.Local;

    console.log(`\nRegistering agent…`);
    console.log(`  H3 index    : ${h3Index}`);
    console.log(`  Resolution  : ${resolution}`);
    console.log(`  Preference  : ${preferenceLabel(preference)}`);

    const txHash = await registry.write.registerSpatial([h3Index, resolution, preference]);
    await publicClient.waitForTransactionReceipt({ hash: txHash });
    console.log(`  ✔ Registered  tx: ${txHash}`);
  }

  // 3. Read back the stored record
  const record = await registry.read.getSpatial([account.address]);
  console.log("\nSpatial record:");
  console.log(`  agent        : ${record.agent}`);
  console.log(`  h3Index      : ${record.h3Index}`);
  console.log(`  resolution   : ${record.resolution}`);
  console.log(`  preference   : ${preferenceLabel(record.preference)}`);
  console.log(`  registeredAt : ${new Date(Number(record.registeredAt) * 1000).toISOString()}`);
  console.log(`  updatedAt    : ${new Date(Number(record.updatedAt) * 1000).toISOString()}`);

  // 4. Update the record to a higher resolution with Regional preference
  console.log("\nUpdating to resolution 7 with Regional preference…");
  const updateHash = await registry.write.updateSpatial([
    "89283082803ffff",
    7,
    ExecutionPreference.Regional,
  ]);
  await publicClient.waitForTransactionReceipt({ hash: updateHash });
  console.log(`  ✔ Updated     tx: ${updateHash}`);

  // 5. (Optional) Deregister — commented out to preserve state
  // console.log("\nDeregistering…");
  // const deregHash = await registry.write.deregisterSpatial([]);
  // await publicClient.waitForTransactionReceipt({ hash: deregHash });
  // console.log(`  ✔ Deregistered tx: ${deregHash}`);
}

main().catch((err) => { console.error(err); process.exit(1); });

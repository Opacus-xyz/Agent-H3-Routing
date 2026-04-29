# Agent H3 Routing — ERC-8242

> **H3 Spatial Identity Extension for On-Chain Agents**
>
> A lightweight on-chain registry for agent spatial identity using Uber's H3 hexagonal hierarchical indexing system, enabling spatial-aware agent discovery without transport or execution constraints.

[![ERC-8242 Draft](https://img.shields.io/badge/ERC-8242-blue)](https://github.com/ethereum/ERCs/pull/1634)
[![License: CC0-1.0](https://img.shields.io/badge/License-CC0--1.0-lightgrey)](LICENSE)
[![CI](https://github.com/Opacus-xyz/Agent-H3-Routing/actions/workflows/ci.yml/badge.svg)](https://github.com/Opacus-xyz/Agent-H3-Routing/actions/workflows/ci.yml)
[![Solidity](https://img.shields.io/badge/Solidity-0.8.24-blue)](https://docs.soliditylang.org)

---

## Overview

ERC-8242 defines `IERC8242`, a standard on-chain interface for registering and discovering agent spatial identity.

**Key design principles:**

| Principle | Description |
|-----------|-------------|
| Pure metadata | No transport, execution, or networking layers. |
| No bond or fee | Registration is free; spatial cells are non-exclusive and non-rivalrous. |
| Non-binding hints | `execution_preference` is a routing signal; consumers apply their own scoring. |
| H3 hierarchy | Agents declare locality at any of H3's 16 resolutions (global → ~1 m²). |
| ERC-165 compliant | `supportsInterface(type(IERC8242).interfaceId)` returns `true`. |

**What it is not:**
- It is not a transport protocol.
- It is not a proof of physical presence.
- It does not enforce routing decisions.

---

## Table of Contents

- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [Interface Reference](#interface-reference)
- [Off-Chain JSON Schema](#off-chain-json-schema)
- [H3 Primer](#h3-primer)
- [Deployments](#deployments)
- [Integration Guide](#integration-guide)
- [Security Considerations](#security-considerations)
- [Contributing](#contributing)
- [License](#license)

---

## Quick Start

### Install

```bash
npm install @opacus-xyz/agent-h3-routing @openzeppelin/contracts
```

### Import the interface

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@opacus-xyz/agent-h3-routing/contracts/interfaces/IERC8242.sol";

contract MyScheduler {
    IERC8242 public registry;

    constructor(address _registry) {
        registry = IERC8242(_registry);
    }

    /// Assign task to the nearest local agent in a given H3 cell.
    function findLocalAgent(string calldata h3Cell)
        external view returns (address)
    {
        (IERC8242.SpatialRecord[] memory agents, ) = registry.discoverAgents(
            h3Cell,
            5,                                    // resolution 5 (~252 km²)
            IERC8242.ExecutionPreference.Local,   // local preference only
            0,                                    // offset
            1                                     // limit — first match
        );
        require(agents.length > 0, "no local agent found");
        return agents[0].agent;
    }
}
```

### Register an agent (TypeScript / viem)

```typescript
import { createWalletClient, http } from "viem";
import { baseSepolia } from "viem/chains";

const tx = await registry.write.registerSpatial([
  "8928308280fffff",   // H3 cell at resolution 5
  5,                   // resolution
  0,                   // ExecutionPreference.Local
]);
```

Full examples are in [`examples/register.ts`](examples/register.ts) and [`examples/discover.ts`](examples/discover.ts).

---

## Architecture

```
contracts/
├── interfaces/
│   └── IERC8242.sol         ← Standard interface (import this)
└── ERC8242SpatialRegistry.sol  ← Reference implementation

examples/
├── register.ts              ← Register / update / deregister (viem)
├── discover.ts              ← Paginated discovery + event indexing
└── spatial-identity.schema.json  ← Off-chain JSON schema

test/
└── ERC8242SpatialRegistry.test.ts  ← Hardhat test suite

scripts/
└── deploy.ts               ← Deployment script
```

---

## Interface Reference

### Enum: `ExecutionPreference`

| Value | Description |
|-------|-------------|
| `Local` (0) | Prefer tasks within the same H3 cell or immediate neighbours. |
| `Regional` (1) | Prefer tasks within parent cells up to resolution 3. |
| `Global` (2) | No spatial preference (default). |

### Struct: `SpatialRecord`

```solidity
struct SpatialRecord {
    address             agent;
    string              h3Index;       // H3 cell identifier string
    uint8               resolution;    // H3 resolution (0–15)
    ExecutionPreference preference;    // Routing hint; non-binding
    uint64              registeredAt;  // UNIX timestamp; immutable after creation
    uint64              updatedAt;     // UNIX timestamp of last mutation
}
```

### Functions

#### `registerSpatial`

```solidity
function registerSpatial(
    string calldata     h3Index,
    uint8               resolution,
    ExecutionPreference preference
) external;
```

Registers a new spatial identity for `msg.sender`. Reverts if already registered, if `h3Index` is empty, or if `resolution > 15`. Sets `registeredAt = updatedAt = block.timestamp`. Emits `SpatialRegistered`.

---

#### `updateSpatial`

```solidity
function updateSpatial(
    string calldata     h3Index,
    uint8               resolution,
    ExecutionPreference preference
) external;
```

Replaces the caller's spatial record in-place. `registeredAt` is preserved unchanged. Emits `SpatialUpdated`.

---

#### `deregisterSpatial`

```solidity
function deregisterSpatial() external;
```

Removes the caller's spatial record. Emits `SpatialDeregistered`.

---

#### `getSpatial`

```solidity
function getSpatial(address agent)
    external view returns (SpatialRecord memory);
```

Returns the full spatial record for `agent`. Returns an empty struct (all zeros) if no record exists.

---

#### `discoverAgents`

```solidity
function discoverAgents(
    string calldata     h3Parent,
    uint8               resolution,
    ExecutionPreference preference,
    uint256             offset,
    uint256             limit
) external view returns (SpatialRecord[] memory records, uint256 total);
```

Paginated discovery of agents by spatial proximity and preference.

| Parameter | Behaviour |
|-----------|-----------|
| `h3Parent` | Filter by agents whose `h3Index` starts with this prefix (simplified H3 containment). Pass `""` for global scope. |
| `resolution` | Only include agents registered at this resolution when `h3Parent` is non-empty. |
| `preference` | Filter by `ExecutionPreference`. `Global` disables preference filtering. |
| `offset` | Pagination start position (0-indexed). |
| `limit` | Maximum records to return per page. |

Results are ordered by ascending `registeredAt` for stable, non-duplicating pagination.

---

### Events

```solidity
event SpatialRegistered(address indexed agent, string h3Index, ExecutionPreference preference);
event SpatialUpdated(address indexed agent, string h3Index, ExecutionPreference preference);
event SpatialDeregistered(address indexed agent);
```

---

## Off-Chain JSON Schema

For agent identity documents (DID documents, metadata files, off-chain registrations):

```json
{
  "spatial": {
    "h3_index": "8928308280fffff",
    "resolution": 5,
    "execution_preference": "local"
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `h3_index` | string | yes | H3 cell identifier string |
| `resolution` | integer (0–15) | yes | H3 resolution |
| `execution_preference` | `"local"` \| `"regional"` \| `"global"` | no | Routing hint; default `"global"` |

The full JSON Schema is at [`examples/spatial-identity.schema.json`](examples/spatial-identity.schema.json).

If `spatial` is absent from an agent document, the agent MUST be treated as `execution_preference = "global"`.

---

## H3 Primer

H3 is a hexagonal hierarchical geospatial indexing system developed by Uber. H3 cells:

- Are hexagons tiling the globe at 16 resolutions (0 = ~4.25M km² → 15 = ~0.9 m²).
- Are identified by a 64-bit integer (encoded as a 15-character hex string, e.g. `8928308280fffff`).
- Support efficient hierarchical queries: a parent cell at resolution `r` contains exactly 7 children at resolution `r+1`.

**Recommended resolution:** `5` (~252 km² per cell) is a good default for regional agent routing.

**Useful tools:**

| Resource | Link |
|----------|------|
| H3 documentation | https://h3geo.org/docs/ |
| H3 JavaScript library | https://www.npmjs.com/package/h3-js |
| Interactive H3 explorer | https://wolf-h3-viewer.glitch.me/ |
| H3 Solidity (reference) | https://github.com/nicholasdgoodman/solidity-h3 |

---

## Deployments

| Network | Address | Explorer |
|---------|---------|----------|
| Base Sepolia (testnet) | _coming soon_ | — |
| Base Mainnet | _coming soon_ | — |

> Deployments will be listed here as they are published. Check the [Releases](https://github.com/Opacus-xyz/Agent-H3-Routing/releases) page for the latest addresses.

---

## Integration Guide

### Option A: Solidity — consume the registry in another contract

```solidity
import "@opacus-xyz/agent-h3-routing/contracts/interfaces/IERC8242.sol";

IERC8242 registry = IERC8242(REGISTRY_ADDRESS);

// Check if an agent is registered
IERC8242.SpatialRecord memory rec = registry.getSpatial(agentAddress);
bool hasRecord = rec.agent != address(0);

// Paginate all local agents in a cell
(IERC8242.SpatialRecord[] memory agents, uint256 total) =
    registry.discoverAgents("8928308280fffff", 5, IERC8242.ExecutionPreference.Local, 0, 50);
```

### Option B: TypeScript / viem — direct RPC calls

```typescript
import { createPublicClient, http, parseAbi } from "viem";
import { base } from "viem/chains";

const client = createPublicClient({ chain: base, transport: http() });

const [records, total] = await client.readContract({
  address:      REGISTRY_ADDRESS,
  abi:          parseAbi([
    "function discoverAgents(string, uint8, uint8, uint256, uint256) view returns (tuple(address agent, string h3Index, uint8 resolution, uint8 preference, uint64 registeredAt, uint64 updatedAt)[], uint256)"
  ]),
  functionName: "discoverAgents",
  args:         ["8928308280fffff", 5, 0, 0n, 50n],
});
```

### Option C: Off-chain event indexing (The Graph or custom indexer)

Subscribe to `SpatialRegistered`, `SpatialUpdated`, and `SpatialDeregistered` events to build a local index. This is the recommended pattern for large-scale deployments where on-chain O(n) pagination is undesirable.

```typescript
const logs = await client.getLogs({
  address:  REGISTRY_ADDRESS,
  event:    parseAbiItem("event SpatialRegistered(address indexed agent, string h3Index, uint8 preference)"),
  fromBlock: 0n,
  toBlock:   "latest",
});
```

---

## Security Considerations

- **Self-reported claims** — `h3Index` and `execution_preference` are self-reported. There is no proof of physical presence. Consumers MUST treat all spatial records as non-binding routing hints.
- **No financial risk** — This standard involves no bonds, fees, or token transfers, which eliminates reentrancy and approval attack surfaces.
- **H3 index validation** — The reference implementation stores `h3Index` as an opaque string. It validates non-empty and that `resolution ≤ 15`, but does not validate H3 structural correctness. Implementations SHOULD validate well-formedness off-chain before submitting.
- **O(n) scan** — `discoverAgents` is O(n) in the reference implementation. For registries with many thousands of agents, use off-chain indexing rather than on-chain pagination.

---

## Contributing

Pull requests are welcome. Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

To run the test suite locally:

```bash
npm install
npm test
```

---

## EIP Reference

- **ERC-8242 PR:** https://github.com/ethereum/ERCs/pull/1634
- **Ethereum Magicians discussion:** https://ethereum-magicians.org/t/erc-8242-agent-quic-http3-transport-endpoint-registry/28394

---

## License

This repository is released under [CC0-1.0](LICENSE) — no rights reserved.

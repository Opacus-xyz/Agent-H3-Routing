// SPDX-License-Identifier: CC0-1.0
pragma solidity ^0.8.20;

import {IERC8242} from "./interfaces/IERC8242.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {ERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";

/**
 * @title ERC8242SpatialRegistry
 * @notice Reference implementation of ERC-8242: H3 Spatial Identity Extension for On-Chain Agents.
 *
 * @dev Features:
 *   - Open registration: any address (EOA or contract) may register a spatial record.
 *   - Self-sovereign updates: only the registered agent can update or remove its own record.
 *   - No fees: registration, update, and deregistration are free of any protocol fee.
 *   - ERC-165: `supportsInterface` returns `true` for both `IERC8242` and `IERC165`.
 *   - Pagination: `discoverAgents` paginates ordered by `registeredAt` ascending for
 *     deterministic, stable results.
 *
 * ⚠️  Scale note: `discoverAgents` performs an O(n) linear scan. This reference implementation
 *     is suitable for networks and registries with a bounded number of agents. For large-scale
 *     deployments, consider off-chain indexing (The Graph, custom indexer) combined with this
 *     contract's events.
 *
 * ⚠️  Trust note: H3 indices and execution preferences are self-reported. Consumers MUST treat
 *     all spatial records as non-binding routing hints.
 *
 * EIP: https://eips.ethereum.org/EIPS/eip-8242
 */
contract ERC8242SpatialRegistry is IERC8242, ERC165 {

    // ─── State ────────────────────────────────────────────────────────────────

    /// @dev Maps agent address to their spatial record.
    mapping(address => SpatialRecord) private _records;

    /// @dev Ordered list of all registered agent addresses.
    address[] private _registrants;

    /// @dev Maps agent address to 1-based index in `_registrants` (0 = not registered).
    mapping(address => uint256) private _registrantIndex;

    // ─── ERC-165 ─────────────────────────────────────────────────────────────

    /**
     * @inheritdoc IERC165
     */
    function supportsInterface(bytes4 interfaceId)
        public view override returns (bool)
    {
        return
            interfaceId == type(IERC8242).interfaceId ||
            super.supportsInterface(interfaceId);
    }

    // ─── Write Functions ─────────────────────────────────────────────────────

    /**
     * @inheritdoc IERC8242
     */
    function registerSpatial(
        string calldata     h3Index,
        uint8               resolution,
        ExecutionPreference preference
    ) external override {
        require(bytes(h3Index).length > 0,         "ERC8242: empty h3Index");
        require(_registrantIndex[msg.sender] == 0, "ERC8242: already registered");
        require(resolution <= 15,                  "ERC8242: resolution out of range");

        _registrants.push(msg.sender);
        _registrantIndex[msg.sender] = _registrants.length; // 1-based

        _records[msg.sender] = SpatialRecord({
            agent:        msg.sender,
            h3Index:      h3Index,
            resolution:   resolution,
            preference:   preference,
            registeredAt: uint64(block.timestamp),
            updatedAt:    uint64(block.timestamp)
        });

        emit SpatialRegistered(msg.sender, h3Index, preference);
    }

    /**
     * @inheritdoc IERC8242
     */
    function updateSpatial(
        string calldata     h3Index,
        uint8               resolution,
        ExecutionPreference preference
    ) external override {
        require(_registrantIndex[msg.sender] != 0, "ERC8242: not registered");
        require(bytes(h3Index).length > 0,         "ERC8242: empty h3Index");
        require(resolution <= 15,                  "ERC8242: resolution out of range");

        SpatialRecord storage rec = _records[msg.sender];
        rec.h3Index    = h3Index;
        rec.resolution = resolution;
        rec.preference = preference;
        rec.updatedAt  = uint64(block.timestamp);

        emit SpatialUpdated(msg.sender, h3Index, preference);
    }

    /**
     * @inheritdoc IERC8242
     */
    function deregisterSpatial() external override {
        uint256 idx = _registrantIndex[msg.sender];
        require(idx != 0, "ERC8242: not registered");

        // Swap with last element and pop for O(1) deletion
        uint256 last = _registrants.length - 1;
        uint256 pos  = idx - 1; // convert to 0-based

        if (pos != last) {
            address tail = _registrants[last];
            _registrants[pos]   = tail;
            _registrantIndex[tail] = idx; // keep 1-based
        }

        _registrants.pop();
        delete _registrantIndex[msg.sender];
        delete _records[msg.sender];

        emit SpatialDeregistered(msg.sender);
    }

    // ─── Read Functions ───────────────────────────────────────────────────────

    /**
     * @inheritdoc IERC8242
     */
    function getSpatial(address agent)
        external view override returns (SpatialRecord memory)
    {
        return _records[agent];
    }

    /**
     * @inheritdoc IERC8242
     * @dev Performs an O(n) scan over all registrants. Sort order is by `registeredAt`
     *      ascending as guaranteed by the append-only `_registrants` array.
     *
     *      Spatial filtering: when `h3Parent` is non-empty, this implementation checks
     *      whether the stored `h3Index` has `h3Parent` as a byte-prefix. This is a
     *      simplified approximation; a production system should use an off-chain H3
     *      library to compute true hierarchical containment.
     */
    function discoverAgents(
        string calldata     h3Parent,
        uint8               resolution,
        ExecutionPreference preference,
        uint256             offset,
        uint256             limit
    ) external view override returns (SpatialRecord[] memory records, uint256 total) {
        uint256 n          = _registrants.length;
        bytes  memory pref = bytes(h3Parent);
        bool   filterSpatial = pref.length > 0;
        bool   filterPref    = preference != ExecutionPreference.Global;
        bool   filterRes     = filterSpatial && resolution > 0;

        // ── First pass: count matching records ───────────────────────────────
        uint256 count = 0;
        for (uint256 i = 0; i < n; ) {
            SpatialRecord storage rec = _records[_registrants[i]];
            if (_matches(rec, pref, filterSpatial, resolution, filterRes, preference, filterPref)) {
                unchecked { ++count; }
            }
            unchecked { ++i; }
        }
        total = count;

        // ── Guard pagination inputs ──────────────────────────────────────────
        if (offset >= count || limit == 0) {
            return (new SpatialRecord[](0), total);
        }
        uint256 available = count - offset;
        uint256 size      = available < limit ? available : limit;

        // ── Second pass: collect the requested page ──────────────────────────
        records = new SpatialRecord[](size);
        uint256 matched = 0;
        uint256 filled  = 0;

        for (uint256 i = 0; i < n && filled < size; ) {
            SpatialRecord storage rec = _records[_registrants[i]];
            if (_matches(rec, pref, filterSpatial, resolution, filterRes, preference, filterPref)) {
                if (matched >= offset) {
                    records[filled] = rec;
                    unchecked { ++filled; }
                }
                unchecked { ++matched; }
            }
            unchecked { ++i; }
        }
    }

    // ─── Internal ─────────────────────────────────────────────────────────────

    /**
     * @dev Returns true if `rec` satisfies all active filters.
     */
    function _matches(
        SpatialRecord storage rec,
        bytes memory           h3Prefix,
        bool                   filterSpatial,
        uint8                  resolution,
        bool                   filterRes,
        ExecutionPreference    preference,
        bool                   filterPref
    ) private view returns (bool) {
        if (rec.agent == address(0)) return false;

        if (filterPref && rec.preference != preference) return false;

        if (filterRes && rec.resolution != resolution) return false;

        if (filterSpatial) {
            bytes memory stored = bytes(rec.h3Index);
            if (stored.length < h3Prefix.length) return false;
            for (uint256 k = 0; k < h3Prefix.length; ) {
                if (stored[k] != h3Prefix[k]) return false;
                unchecked { ++k; }
            }
        }

        return true;
    }

    // ─── View helpers ─────────────────────────────────────────────────────────

    /**
     * @notice Returns the total number of currently registered agents.
     */
    function totalRegistered() external view returns (uint256) {
        return _registrants.length;
    }

    /**
     * @notice Returns true if `agent` has a registered spatial record.
     */
    function isRegistered(address agent) external view returns (bool) {
        return _registrantIndex[agent] != 0;
    }
}

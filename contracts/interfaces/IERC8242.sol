// SPDX-License-Identifier: CC0-1.0
pragma solidity ^0.8.20;

/**
 * @title IERC8242 – H3 Spatial Identity Extension for On-Chain Agents
 * @notice Standard interface for registering and discovering on-chain agent spatial identity
 *         using Uber's H3 hexagonal hierarchical indexing system.
 * @dev    ERC-8242 is a pure metadata extension. It does NOT define transport, execution,
 *         or networking layers. Spatial records are self-reported routing hints only.
 *
 *         EIP reference: https://eips.ethereum.org/EIPS/eip-8242
 */
interface IERC8242 {

    // ─── Enums ──────────────────────────────────────────────────────────────

    /**
     * @notice Signals the agent's preferred task-assignment scope.
     * @dev    Consumers MUST treat this as a non-binding routing hint.
     */
    enum ExecutionPreference {
        Local,     // Prefer tasks within the same H3 cell or immediate neighbours
        Regional,  // Prefer tasks within parent cells up to resolution 3
        Global     // No spatial preference (default)
    }

    // ─── Structs ─────────────────────────────────────────────────────────────

    /**
     * @notice Full spatial record stored for a registered agent.
     * @param agent          The agent's Ethereum address.
     * @param h3Index        H3 cell identifier string (e.g. "8928308280fffff").
     * @param resolution     H3 resolution integer (0–15).
     * @param preference     Execution locality preference; non-binding.
     * @param registeredAt   UNIX timestamp set on creation; never changes thereafter.
     * @param updatedAt      UNIX timestamp of most recent mutation.
     */
    struct SpatialRecord {
        address             agent;
        string              h3Index;
        uint8               resolution;
        ExecutionPreference preference;
        uint64              registeredAt;
        uint64              updatedAt;
    }

    // ─── Events ──────────────────────────────────────────────────────────────

    /**
     * @notice Emitted when an agent registers a new spatial record.
     */
    event SpatialRegistered(
        address indexed     agent,
        string              h3Index,
        ExecutionPreference preference
    );

    /**
     * @notice Emitted when an agent updates its existing spatial record.
     */
    event SpatialUpdated(
        address indexed     agent,
        string              h3Index,
        ExecutionPreference preference
    );

    /**
     * @notice Emitted when an agent removes its spatial record.
     */
    event SpatialDeregistered(address indexed agent);

    // ─── Write Functions ─────────────────────────────────────────────────────

    /**
     * @notice Register a new spatial identity for `msg.sender`.
     * @dev    MUST revert if `h3Index` is empty.
     *         MUST revert if caller is already registered.
     *         MUST revert if `resolution > 15`.
     *         MUST set `registeredAt = block.timestamp`.
     *         MUST NOT collect any fee or bond.
     * @param h3Index    H3 cell identifier string.
     * @param resolution H3 resolution (0–15). Recommended: 5 (~252 km²).
     * @param preference Execution locality hint.
     */
    function registerSpatial(
        string calldata     h3Index,
        uint8               resolution,
        ExecutionPreference preference
    ) external;

    /**
     * @notice Update the spatial identity for `msg.sender`.
     * @dev    MUST revert if caller has no existing record.
     *         MUST NOT collect any fee.
     *         MUST set `updatedAt = block.timestamp`.
     * @param h3Index    New H3 cell identifier string.
     * @param resolution New H3 resolution (0–15).
     * @param preference New execution locality hint.
     */
    function updateSpatial(
        string calldata     h3Index,
        uint8               resolution,
        ExecutionPreference preference
    ) external;

    /**
     * @notice Remove the spatial record for `msg.sender`.
     * @dev    MUST delete the stored record and emit `SpatialDeregistered`.
     */
    function deregisterSpatial() external;

    // ─── Read Functions ───────────────────────────────────────────────────────

    /**
     * @notice Retrieve the spatial record for a given agent.
     * @dev    MUST return an empty record (all zero/default values) if no record exists.
     * @param agent Address of the agent to query.
     * @return      The agent's `SpatialRecord`.
     */
    function getSpatial(address agent)
        external view returns (SpatialRecord memory);

    /**
     * @notice Paginated discovery of agents by spatial proximity and preference.
     * @dev    MUST filter by agents whose `h3Index` falls within `h3Parent` at the given
     *         `resolution` when `h3Parent` is non-empty.
     *         MUST filter by `preference` when `preference != ExecutionPreference.Global`.
     *         Results MUST be ordered by ascending `registeredAt` for stable pagination.
     *         SHOULD return all records when `h3Parent` is empty and
     *         `preference == ExecutionPreference.Global`.
     * @param h3Parent   Parent H3 cell string; pass empty string for global scope.
     * @param resolution Target resolution for child filtering.
     * @param preference Filter by execution preference; Global = no filter.
     * @param offset     Pagination offset (0-indexed).
     * @param limit      Maximum number of records to return.
     * @return records   Matching spatial records.
     * @return total     Total count of matching records (ignoring pagination).
     */
    function discoverAgents(
        string calldata     h3Parent,
        uint8               resolution,
        ExecutionPreference preference,
        uint256             offset,
        uint256             limit
    ) external view returns (SpatialRecord[] memory records, uint256 total);
}

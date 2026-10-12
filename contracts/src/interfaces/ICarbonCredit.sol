// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title ICarbonCredit
/// @notice Issuance interface used by Verification, and token id helpers.
interface ICarbonCredit {
    /// @notice Issue `net` credits to `to` and `buffer` credits to the locked buffer pool.
    /// @dev Callable only by the Verification contract.
    function issue(address to, uint256 tokenId, uint256 claimId, uint256 net, uint256 buffer) external;

    /// @notice Token id for a project and vintage year: `projectId << 16 | vintage`.
    function encodeTokenId(uint256 projectId, uint256 vintage) external pure returns (uint256);

    /// @notice Project id encoded in `tokenId`.
    function projectOf(uint256 tokenId) external pure returns (uint256);
}

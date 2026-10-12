// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title IProjectRegistry
/// @notice Read interface used by Verification and Marketplace.
interface IProjectRegistry {
    enum ProjectStatus {
        None,
        Active,
        Closed
    }

    /// @notice Core fields of a project in a single call (one SLOAD for most of them).
    function projectCore(uint256 projectId)
        external
        view
        returns (
            address owner,
            address community,
            uint32 cellCount,
            ProjectStatus status,
            uint40 registeredAt
        );

    /// @notice Wallet receiving the community share for `projectId`.
    function communityOf(uint256 projectId) external view returns (address);
}

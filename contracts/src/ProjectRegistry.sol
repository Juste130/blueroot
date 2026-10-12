// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {
    AccessControlDefaultAdminRules
} from "@openzeppelin/contracts/access/extensions/AccessControlDefaultAdminRules.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

import {IProjectRegistry} from "./interfaces/IProjectRegistry.sol";

/// @title ProjectRegistry
/// @author BlueRoot
/// @notice Registry of mangrove restoration projects and of the H3 cells they cover.
/// @dev Spatial uniqueness: an H3 cell belongs to at most one ACTIVE project. Closing a project frees
///      all of its cells in O(1): `cellOwner` is only honoured while the owning project is active, so no
///      loop over a growing array is ever needed.
contract ProjectRegistry is IProjectRegistry, AccessControlDefaultAdminRules, Pausable {
    /// @notice Role allowed to register projects (community organisations / NGOs, onboarded by governance).
    /// @dev Permissionless registration would let anyone squat cells for free and block real projects.
    bytes32 public constant PROPONENT_ROLE = keccak256("PROPONENT_ROLE");
    /// @notice Role allowed to pause in an emergency. Unpausing stays with the admin.
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    /// @notice Maximum number of cells accepted in a single `addCells` call (bounded gas).
    uint256 public constant MAX_CELLS_PER_CALL = 100;
    /// @notice H3 resolution accepted by the registry (res 10 ~ 1.5 ha per cell).
    uint256 public constant H3_RESOLUTION = 10;
    /// @dev The 5 digits finer than res 10 (3 bits each) must all be 7 in a res-10 cell index.
    uint64 private constant UNUSED_DIGITS_MASK = 0x7FFF;

    /// @dev Packed in two storage slots: (owner, cellCount, status, registeredAt) + community.
    struct Project {
        address owner;
        uint32 cellCount;
        ProjectStatus status;
        uint40 registeredAt;
        address community;
        bytes32 metadataHash;
    }

    /// @notice Number of projects ever registered. Ids start at 1 (0 means "no project").
    uint64 public projectCount;

    mapping(uint256 projectId => Project) private _projects;
    /// @notice Last project that claimed a cell. Only meaningful while that project is active.
    mapping(uint64 cell => uint256 projectId) private _cellProject;

    error ZeroAddress();
    error EmptyMetadata();
    error UnknownProject(uint256 projectId);
    error ProjectNotActive(uint256 projectId);
    error NotProjectOwner(uint256 projectId, address caller);
    error InvalidCellCount(uint256 count);
    error InvalidCell(uint64 cell);
    error CellAlreadyClaimed(uint64 cell, uint256 projectId);

    event ProjectRegistered(
        uint256 indexed projectId, address indexed owner, address indexed community, bytes32 metadataHash
    );
    event CellsAdded(uint256 indexed projectId, uint64[] cells, uint32 totalCells);
    event ProjectClosed(uint256 indexed projectId, address indexed by);

    /// @param admin Governance address (multisig). Admin transfers are two-step with `adminDelay`.
    /// @param adminDelay Delay (seconds) before a new default admin can accept the role.
    constructor(address admin, uint48 adminDelay) AccessControlDefaultAdminRules(adminDelay, admin) {}

    // ---------------------------------------------------------------------------------------------
    // Proponent actions
    // ---------------------------------------------------------------------------------------------

    /// @notice Register a new project. The caller becomes its owner.
    /// @param metadataHash Hash (e.g. sha256 digest of the IPFS document) of the project metadata.
    /// @param community Wallet receiving the guaranteed community share on every sale.
    /// @return projectId The new project id.
    function registerProject(bytes32 metadataHash, address community)
        external
        whenNotPaused
        onlyRole(PROPONENT_ROLE)
        returns (uint256 projectId)
    {
        if (metadataHash == bytes32(0)) revert EmptyMetadata();
        if (community == address(0)) revert ZeroAddress();

        unchecked {
            projectId = ++projectCount;
        }
        _projects[projectId] = Project({
            owner: msg.sender,
            cellCount: 0,
            status: ProjectStatus.Active,
            registeredAt: uint40(block.timestamp),
            community: community,
            metadataHash: metadataHash
        });

        emit ProjectRegistered(projectId, msg.sender, community, metadataHash);
    }

    /// @notice Add H3 cells to an active project. Reverts if any cell is already held by an active project
    ///         (including this one, which also rejects duplicates inside `cells`).
    /// @param projectId Project to extend.
    /// @param cells H3 indexes at resolution `H3_RESOLUTION`, 1 to `MAX_CELLS_PER_CALL` items.
    function addCells(uint256 projectId, uint64[] calldata cells) external whenNotPaused {
        Project storage project = _projects[projectId];
        if (project.owner != msg.sender) {
            if (project.owner == address(0)) revert UnknownProject(projectId);
            revert NotProjectOwner(projectId, msg.sender);
        }
        if (project.status != ProjectStatus.Active) revert ProjectNotActive(projectId);

        uint256 length = cells.length;
        if (length == 0 || length > MAX_CELLS_PER_CALL) revert InvalidCellCount(length);

        for (uint256 i; i < length;) {
            uint64 cell = cells[i];
            if (!_isValidCell(cell)) revert InvalidCell(cell);

            uint256 holder = _cellProject[cell];
            if (holder != 0 && _projects[holder].status == ProjectStatus.Active) {
                revert CellAlreadyClaimed(cell, holder);
            }
            _cellProject[cell] = projectId;
            unchecked {
                ++i;
            }
        }

        // casting to 'uint32' is safe because length <= MAX_CELLS_PER_CALL; the sum is overflow-checked.
        // forge-lint: disable-next-line(unsafe-typecast)
        uint32 total = project.cellCount + uint32(length);
        project.cellCount = total;
        emit CellsAdded(projectId, cells, total);
    }

    // ---------------------------------------------------------------------------------------------
    // Governance
    // ---------------------------------------------------------------------------------------------

    /// @notice Close a project. Its cells become available again for other projects. Irreversible.
    function closeProject(uint256 projectId) external onlyRole(DEFAULT_ADMIN_ROLE) {
        Project storage project = _projects[projectId];
        if (project.owner == address(0)) revert UnknownProject(projectId);
        if (project.status != ProjectStatus.Active) revert ProjectNotActive(projectId);

        project.status = ProjectStatus.Closed;
        emit ProjectClosed(projectId, msg.sender);
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    // ---------------------------------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------------------------------

    /// @inheritdoc IProjectRegistry
    function projectCore(uint256 projectId)
        external
        view
        returns (
            address owner,
            address community,
            uint32 cellCount,
            ProjectStatus status,
            uint40 registeredAt
        )
    {
        Project storage p = _projects[projectId];
        return (p.owner, p.community, p.cellCount, p.status, p.registeredAt);
    }

    /// @inheritdoc IProjectRegistry
    function communityOf(uint256 projectId) external view returns (address) {
        return _projects[projectId].community;
    }

    /// @notice Full project record.
    function getProject(uint256 projectId) external view returns (Project memory) {
        return _projects[projectId];
    }

    /// @notice Active project holding `cell`, or 0 if the cell is free.
    function projectOfCell(uint64 cell) external view returns (uint256) {
        uint256 holder = _cellProject[cell];
        return (holder != 0 && _projects[holder].status == ProjectStatus.Active) ? holder : 0;
    }

    /// @notice Whether `cell` is a well-formed H3 cell index at `H3_RESOLUTION`.
    function isValidCell(uint64 cell) external pure returns (bool) {
        return _isValidCell(cell);
    }

    /// @dev H3 index layout (MSB first): 1 reserved bit (0), 4 mode bits (1 = cell), 3 reserved bits (0),
    ///      4 resolution bits, 7 base-cell bits, then 15 digits of 3 bits. Digits finer than the resolution
    ///      must all be 7. This rejects malformed integers cheaply; full validation is done off-chain (h3-js).
    function _isValidCell(uint64 cell) private pure returns (bool) {
        return (cell >> 56) == 0x08 // reserved bit 0, mode 1, reserved 000
            && (cell >> 52) & 0xF == H3_RESOLUTION && (cell >> 45) & 0x7F < 122 // 122 base cells
            && cell & UNUSED_DIGITS_MASK == UNUSED_DIGITS_MASK;
    }
}

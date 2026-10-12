// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {
    AccessControlDefaultAdminRules
} from "@openzeppelin/contracts/access/extensions/AccessControlDefaultAdminRules.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";

import {ICarbonCredit} from "./interfaces/ICarbonCredit.sol";
import {IProjectRegistry} from "./interfaces/IProjectRegistry.sol";
import {DateUtils} from "./libraries/DateUtils.sol";

/// @title Verification
/// @author BlueRoot
/// @notice Anchors verification reports and collects human attestations before issuing credits.
/// @dev Claim lifecycle: Pending -> Approved -> Finalized, or Pending -> Rejected.
///      A Pending claim whose deadline has passed is expired (derived, not stored).
///      Anti double counting in time: monitoring periods of a project never overlap and never start
///      before the project was registered. Only one claim per project can be open at a time.
contract Verification is AccessControlDefaultAdminRules, Pausable {
    using SafeCast for uint256;

    bytes32 public constant ANCHOR_ROLE = keccak256("ANCHOR_ROLE");
    bytes32 public constant VALIDATOR_ROLE = keccak256("VALIDATOR_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    uint256 private constant BPS = 10_000;
    uint256 private constant MAX_SCORE = 100;

    // Governance bounds: parameters can be tuned, never pushed outside these limits.
    uint256 public constant MIN_APPROVALS = 2;
    uint256 public constant MAX_APPROVALS = 7;
    uint256 public constant MIN_SCORE_THRESHOLD = 50;
    uint256 public constant MIN_BUFFER_BPS = 1000;
    uint256 public constant MAX_BUFFER_BPS = 5000;
    uint256 public constant MIN_WINDOW = 1 days;
    uint256 public constant MAX_WINDOW = 90 days;
    /// @dev H3 res-10 cell area depends on latitude/position: ~1.19 ha on the Benin coast (h3-js
    ///      `cellArea`), 1.5 ha only on global average. The default (119) is rounded DOWN so the registry
    ///      never over-issues; governance must re-measure it before using another region.
    uint256 public constant MIN_CELL_AREA = 100; // centi-hectares
    uint256 public constant MAX_CELL_AREA = 200;

    enum ClaimStatus {
        None,
        Pending,
        Approved,
        Rejected,
        Finalized
    }

    /// @dev Fits in one storage slot.
    struct Params {
        uint8 requiredApprovals;
        uint8 scoreThreshold; // combined score out of 100
        uint16 bufferBps; // share of issuance locked in the buffer pool
        uint32 validationWindow; // seconds
        uint32 cellAreaCentiHa; // average H3 cell area, in 0.01 ha
    }

    /// @dev Slot 1: 8+5+5+5+5+1+1+1+1 = 32 bytes. Slots 2-3: hashes.
    struct Claim {
        uint64 projectId;
        uint40 periodStart;
        uint40 periodEnd;
        uint40 deadline;
        uint40 quantity; // units of 0.01 verified hectare-year (net + buffer)
        uint8 score;
        uint8 approvals;
        uint8 rejections;
        ClaimStatus status;
        bytes32 reportHash;
        bytes32 satelliteHash;
    }

    IProjectRegistry public immutable REGISTRY;
    ICarbonCredit public immutable CREDIT;

    Params public params;
    uint256 public claimCount;

    mapping(uint256 claimId => Claim) private _claims;
    mapping(uint256 claimId => mapping(address validator => bool)) public hasVoted;
    /// @notice End of the last finalized monitoring period, per project.
    mapping(uint256 projectId => uint40) public claimedUntil;
    /// @notice Currently open claim per project (0 if none).
    mapping(uint256 projectId => uint256 claimId) public openClaimOf;

    error ZeroAddress();
    error InvalidParams();
    error InvalidHash();
    error InvalidScore(uint256 score);
    error ScoreBelowThreshold(uint256 score, uint256 threshold);
    error InvalidPeriod(uint256 start, uint256 end);
    error ProjectNotActive(uint256 projectId);
    error ProjectHasNoCells(uint256 projectId);
    error ClaimStillOpen(uint256 claimId);
    error QuantityIsZero();
    error ClaimNotPending(uint256 claimId);
    error ClaimNotApproved(uint256 claimId);
    error ValidationWindowClosed(uint256 claimId);
    error ReportMismatch(bytes32 expected, bytes32 provided);
    error SelfValidation(uint256 projectId, address validator);
    error AlreadyVoted(uint256 claimId, address validator);

    event ParamsUpdated(Params params);
    event ReportAnchored(
        uint256 indexed claimId,
        uint256 indexed projectId,
        bytes32 reportHash,
        bytes32 satelliteHash,
        uint256 score,
        uint256 periodStart,
        uint256 periodEnd,
        uint256 quantity,
        uint256 deadline
    );
    event Attested(uint256 indexed claimId, address indexed validator, bool approve, bytes32 reportHash);
    event ClaimApproved(uint256 indexed claimId);
    event ClaimRejected(uint256 indexed claimId);
    event ClaimFinalized(
        uint256 indexed claimId,
        uint256 indexed projectId,
        uint256 indexed tokenId,
        uint256 net,
        uint256 buffer
    );

    constructor(address admin, uint48 adminDelay, IProjectRegistry registry, ICarbonCredit credit)
        AccessControlDefaultAdminRules(adminDelay, admin)
    {
        if (address(registry) == address(0) || address(credit) == address(0)) revert ZeroAddress();
        REGISTRY = registry;
        CREDIT = credit;
        _setParams(
            Params({
                requiredApprovals: 2,
                scoreThreshold: 70,
                bufferBps: 2000,
                validationWindow: 14 days,
                cellAreaCentiHa: 119
            })
        );
    }

    // ---------------------------------------------------------------------------------------------
    // Anchoring service
    // ---------------------------------------------------------------------------------------------

    /// @notice Anchor an immutable verification report and open a claim for human validation.
    /// @param projectId Project concerned.
    /// @param reportHash Hash of the public AI-assisted report (IPFS).
    /// @param satelliteHash Hash of the versioned NDVI series (IPFS).
    /// @param score Combined score out of 100 (satellite, field evidence, AI consistency).
    /// @param periodStart Start of the monitoring period (unix seconds).
    /// @param periodEnd End of the monitoring period (unix seconds, not in the future).
    /// @return claimId The new claim id.
    function anchorReport(
        uint256 projectId,
        bytes32 reportHash,
        bytes32 satelliteHash,
        uint256 score,
        uint256 periodStart,
        uint256 periodEnd
    ) external whenNotPaused onlyRole(ANCHOR_ROLE) returns (uint256 claimId) {
        if (reportHash == bytes32(0) || satelliteHash == bytes32(0)) revert InvalidHash();
        uint256 quantity = _verifiedQuantity(projectId, score, periodStart, periodEnd);
        uint256 deadline = block.timestamp + params.validationWindow;

        unchecked {
            claimId = ++claimCount;
        }
        _claims[claimId] = Claim({
            projectId: projectId.toUint64(),
            periodStart: periodStart.toUint40(),
            periodEnd: periodEnd.toUint40(),
            deadline: deadline.toUint40(),
            quantity: quantity.toUint40(),
            // casting to 'uint8' is safe because score <= MAX_SCORE was checked in _verifiedQuantity.
            // forge-lint: disable-next-line(unsafe-typecast)
            score: uint8(score),
            approvals: 0,
            rejections: 0,
            status: ClaimStatus.Pending,
            reportHash: reportHash,
            satelliteHash: satelliteHash
        });
        openClaimOf[projectId] = claimId;

        emit ReportAnchored(
            claimId, projectId, reportHash, satelliteHash, score, periodStart, periodEnd, quantity, deadline
        );
    }

    // ---------------------------------------------------------------------------------------------
    // Validators
    // ---------------------------------------------------------------------------------------------

    /// @notice Vote on a claim. The vote is bound to the exact report hash the validator reviewed.
    /// @param claimId Claim to vote on.
    /// @param reportHash Hash of the report the validator examined; must match the anchored one.
    /// @param approve True to approve, false to reject.
    function attest(uint256 claimId, bytes32 reportHash, bool approve)
        external
        whenNotPaused
        onlyRole(VALIDATOR_ROLE)
    {
        Claim storage claim = _claims[claimId];
        if (claim.status != ClaimStatus.Pending) revert ClaimNotPending(claimId);
        if (block.timestamp > claim.deadline) revert ValidationWindowClosed(claimId);
        if (claim.reportHash != reportHash) revert ReportMismatch(claim.reportHash, reportHash);

        uint256 projectId = claim.projectId;
        (address owner, address community,,,) = REGISTRY.projectCore(projectId);
        if (msg.sender == owner || msg.sender == community) revert SelfValidation(projectId, msg.sender);
        if (hasVoted[claimId][msg.sender]) revert AlreadyVoted(claimId, msg.sender);
        hasVoted[claimId][msg.sender] = true;

        uint8 required = params.requiredApprovals;
        emit Attested(claimId, msg.sender, approve, reportHash);

        if (approve) {
            uint8 approvals = claim.approvals + 1;
            claim.approvals = approvals;
            if (approvals >= required) {
                claim.status = ClaimStatus.Approved;
                emit ClaimApproved(claimId);
            }
        } else {
            uint8 rejections = claim.rejections + 1;
            claim.rejections = rejections;
            if (rejections >= required) {
                claim.status = ClaimStatus.Rejected;
                delete openClaimOf[projectId];
                emit ClaimRejected(claimId);
            }
        }
    }

    /// @notice Issue the credits of an approved claim. Permissionless, callable exactly once.
    function finalize(uint256 claimId) external whenNotPaused {
        Claim storage claim = _claims[claimId];
        if (claim.status != ClaimStatus.Approved) revert ClaimNotApproved(claimId);

        uint256 projectId = claim.projectId;
        (address owner,,, IProjectRegistry.ProjectStatus status,) = REGISTRY.projectCore(projectId);
        if (status != IProjectRegistry.ProjectStatus.Active) revert ProjectNotActive(projectId);

        // Effects
        claim.status = ClaimStatus.Finalized;
        uint40 periodEnd = claim.periodEnd;
        claimedUntil[projectId] = periodEnd;
        delete openClaimOf[projectId];

        uint256 total = claim.quantity;
        uint256 buffer = total * params.bufferBps / BPS;
        uint256 net = total - buffer;
        uint256 tokenId = (projectId << 16) | DateUtils.yearOf(periodEnd);

        emit ClaimFinalized(claimId, projectId, tokenId, net, buffer);

        // Interaction (trusted, immutable contract)
        CREDIT.issue(owner, tokenId, claimId, net, buffer);
    }

    // ---------------------------------------------------------------------------------------------
    // Governance
    // ---------------------------------------------------------------------------------------------

    function setParams(Params calldata newParams) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setParams(newParams);
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

    function getClaim(uint256 claimId) external view returns (Claim memory) {
        return _claims[claimId];
    }

    /// @notice True if the claim is pending and its validation window has passed.
    function isExpired(uint256 claimId) external view returns (bool) {
        Claim storage claim = _claims[claimId];
        return claim.status == ClaimStatus.Pending && block.timestamp > claim.deadline;
    }

    // ---------------------------------------------------------------------------------------------
    // Internal
    // ---------------------------------------------------------------------------------------------

    /// @dev Checks a new claim against the business rules and returns the verified quantity:
    ///      units (0.01 ha-year) = cells * cell area (0.01 ha) * years * score / 100.
    function _verifiedQuantity(uint256 projectId, uint256 score, uint256 periodStart, uint256 periodEnd)
        private
        view
        returns (uint256 quantity)
    {
        if (score > MAX_SCORE) revert InvalidScore(score);
        Params memory p = params;
        if (score < p.scoreThreshold) revert ScoreBelowThreshold(score, p.scoreThreshold);

        (,, uint32 cellCount, IProjectRegistry.ProjectStatus status, uint40 registeredAt) =
            REGISTRY.projectCore(projectId);
        if (status != IProjectRegistry.ProjectStatus.Active) revert ProjectNotActive(projectId);
        if (cellCount == 0) revert ProjectHasNoCells(projectId);

        uint256 open = openClaimOf[projectId];
        if (open != 0 && _isLive(_claims[open])) revert ClaimStillOpen(open);

        uint256 floor = claimedUntil[projectId];
        if (floor < registeredAt) floor = registeredAt;
        if (periodStart < floor || periodEnd <= periodStart || periodEnd > block.timestamp) {
            revert InvalidPeriod(periodStart, periodEnd);
        }

        quantity = uint256(cellCount) * p.cellAreaCentiHa * (periodEnd - periodStart) * score
            / (365 days * MAX_SCORE);
        if (quantity == 0) revert QuantityIsZero();
    }

    /// @dev A claim blocks new ones while it is approved (awaiting finalize) or pending within its window.
    function _isLive(Claim storage claim) private view returns (bool) {
        ClaimStatus s = claim.status;
        return s == ClaimStatus.Approved || (s == ClaimStatus.Pending && block.timestamp <= claim.deadline);
    }

    function _setParams(Params memory p) private {
        if (
            p.requiredApprovals < MIN_APPROVALS || p.requiredApprovals > MAX_APPROVALS
                || p.scoreThreshold < MIN_SCORE_THRESHOLD || p.scoreThreshold > MAX_SCORE
                || p.bufferBps < MIN_BUFFER_BPS || p.bufferBps > MAX_BUFFER_BPS
                || p.validationWindow < MIN_WINDOW || p.validationWindow > MAX_WINDOW
                || p.cellAreaCentiHa < MIN_CELL_AREA || p.cellAreaCentiHa > MAX_CELL_AREA
        ) revert InvalidParams();
        params = p;
        emit ParamsUpdated(p);
    }
}

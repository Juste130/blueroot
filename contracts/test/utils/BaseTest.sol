// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";

import {CarbonCredit} from "../../src/CarbonCredit.sol";
import {Marketplace} from "../../src/Marketplace.sol";
import {ProjectRegistry} from "../../src/ProjectRegistry.sol";
import {Verification} from "../../src/Verification.sol";
import {ICarbonCredit} from "../../src/interfaces/ICarbonCredit.sol";
import {IProjectRegistry} from "../../src/interfaces/IProjectRegistry.sol";
import {MockUSDC} from "../../src/mocks/MockUSDC.sol";

/// @dev Deploys the full BlueRoot system and provides helpers shared by all test suites.
abstract contract BaseTest is Test {
    /// @dev A valid res-10 H3 cell with all digits zero; `cell(i)` varies digits res 1..10.
    uint64 internal constant CELL_BASE = 0x08A7540000007FFF;
    uint256 internal constant START = 1_767_225_600; // 2026-01-01T00:00:00Z

    address internal admin = makeAddr("admin");
    address internal pauser = makeAddr("pauser");
    address internal proponent = makeAddr("proponent");
    address internal proponent2 = makeAddr("proponent2");
    address internal community = makeAddr("community");
    address internal anchor = makeAddr("anchor");
    address internal validator1 = makeAddr("validator1");
    address internal validator2 = makeAddr("validator2");
    address internal validator3 = makeAddr("validator3");
    address internal buyer = makeAddr("buyer");
    address internal treasury = makeAddr("treasury");

    ProjectRegistry internal registry;
    CarbonCredit internal credit;
    Verification internal verification;
    Marketplace internal market;
    MockUSDC internal usdc;

    bytes32 internal constant META = keccak256("project-metadata");
    bytes32 internal constant REPORT = keccak256("report-v1");
    bytes32 internal constant SATELLITE = keccak256("ndvi-series-v1");

    function setUp() public virtual {
        vm.warp(START);

        registry = new ProjectRegistry(admin, 0);
        address predicted = vm.computeCreateAddress(address(this), vm.getNonce(address(this)) + 1);
        credit = new CarbonCredit(admin, 0, predicted, "ipfs://blueroot/{id}.json");
        verification =
            new Verification(admin, 0, IProjectRegistry(address(registry)), ICarbonCredit(address(credit)));
        assertEq(address(verification), predicted, "verification address prediction");
        usdc = new MockUSDC();
        market = new Marketplace(admin, 0, credit, usdc, IProjectRegistry(address(registry)), treasury);

        vm.startPrank(admin);
        registry.grantRole(registry.PROPONENT_ROLE(), proponent);
        registry.grantRole(registry.PROPONENT_ROLE(), proponent2);
        registry.grantRole(registry.PAUSER_ROLE(), pauser);
        verification.grantRole(verification.ANCHOR_ROLE(), anchor);
        verification.grantRole(verification.VALIDATOR_ROLE(), validator1);
        verification.grantRole(verification.VALIDATOR_ROLE(), validator2);
        verification.grantRole(verification.VALIDATOR_ROLE(), validator3);
        verification.grantRole(verification.PAUSER_ROLE(), pauser);
        credit.grantRole(credit.PAUSER_ROLE(), pauser);
        market.grantRole(market.PAUSER_ROLE(), pauser);
        vm.stopPrank();

        vm.label(address(registry), "ProjectRegistry");
        vm.label(address(credit), "CarbonCredit");
        vm.label(address(verification), "Verification");
        vm.label(address(market), "Marketplace");
        vm.label(address(usdc), "MockUSDC");
    }

    // ---------------------------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------------------------

    function cell(uint256 i) internal pure returns (uint64) {
        return CELL_BASE | (uint64(i % (1 << 30)) << 15);
    }

    function cells(uint256 from, uint256 count) internal pure returns (uint64[] memory out) {
        out = new uint64[](count);
        for (uint256 i; i < count; ++i) {
            out[i] = cell(from + i);
        }
    }

    function registerWithCells(address owner, uint256 firstCell, uint256 count)
        internal
        returns (uint256 id)
    {
        vm.startPrank(owner);
        id = registry.registerProject(META, community);
        registry.addCells(id, cells(firstCell, count));
        vm.stopPrank();
    }

    function anchorClaim(uint256 projectId, uint256 score, uint256 start, uint256 end)
        internal
        returns (uint256 claimId)
    {
        vm.prank(anchor);
        claimId = verification.anchorReport(projectId, REPORT, SATELLITE, score, start, end);
    }

    function approveTwice(uint256 claimId) internal {
        vm.prank(validator1);
        verification.attest(claimId, REPORT, true);
        vm.prank(validator2);
        verification.attest(claimId, REPORT, true);
    }

    /// @dev Registers a 10-cell project, runs one full year claim with score 80 and finalizes it.
    ///      Expected issuance: 10 * 150 * 1 year * 80 / 100 = 1200 units (240 buffer, 960 net).
    function issuedProject() internal returns (uint256 projectId, uint256 claimId, uint256 tokenId) {
        projectId = registerWithCells(proponent, 0, 10);
        vm.warp(START + 365 days);
        claimId = anchorClaim(projectId, 80, START, START + 365 days);
        approveTwice(claimId);
        verification.finalize(claimId);
        tokenId = (projectId << 16) | 2027; // periodEnd = 2027-01-01
    }
}

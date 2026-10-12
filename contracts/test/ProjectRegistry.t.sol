// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

import {ProjectRegistry} from "../src/ProjectRegistry.sol";
import {IProjectRegistry} from "../src/interfaces/IProjectRegistry.sol";
import {BaseTest} from "./utils/BaseTest.sol";

contract ProjectRegistryTest is BaseTest {
    // ---------------------------------------------------------------------------------------------
    // F2 - registration
    // ---------------------------------------------------------------------------------------------

    function test_registerProject_storesProjectAndEmits() public {
        vm.expectEmit(address(registry));
        emit ProjectRegistry.ProjectRegistered(1, proponent, community, META);

        vm.prank(proponent);
        uint256 id = registry.registerProject(META, community);

        assertEq(id, 1);
        assertEq(registry.projectCount(), 1);
        ProjectRegistry.Project memory p = registry.getProject(id);
        assertEq(p.owner, proponent);
        assertEq(p.community, community);
        assertEq(p.metadataHash, META);
        assertEq(p.cellCount, 0);
        assertEq(uint8(p.status), uint8(IProjectRegistry.ProjectStatus.Active));
        assertEq(p.registeredAt, START);
    }

    function test_registerProject_revertsWithoutRole() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, buyer, registry.PROPONENT_ROLE()
            )
        );
        vm.prank(buyer);
        registry.registerProject(META, community);
    }

    function test_registerProject_revertsOnBadInput() public {
        vm.startPrank(proponent);
        vm.expectRevert(ProjectRegistry.EmptyMetadata.selector);
        registry.registerProject(bytes32(0), community);
        vm.expectRevert(ProjectRegistry.ZeroAddress.selector);
        registry.registerProject(META, address(0));
        vm.stopPrank();
    }

    function test_addCells_recordsCellsAndEmits() public {
        vm.prank(proponent);
        uint256 id = registry.registerProject(META, community);
        uint64[] memory batch = cells(0, 3);

        vm.expectEmit(address(registry));
        emit ProjectRegistry.CellsAdded(id, batch, 3);
        vm.prank(proponent);
        registry.addCells(id, batch);

        assertEq(registry.getProject(id).cellCount, 3);
        for (uint256 i; i < 3; ++i) {
            assertEq(registry.projectOfCell(batch[i]), id);
        }

        vm.prank(proponent);
        registry.addCells(id, cells(3, 2));
        assertEq(registry.getProject(id).cellCount, 5);
    }

    function test_addCells_acceptsMaxBatch() public {
        uint256 id = registerWithCells(proponent, 0, registry.MAX_CELLS_PER_CALL());
        assertEq(registry.getProject(id).cellCount, 100);
    }

    function test_addCells_revertsOnBadBatchSize() public {
        vm.startPrank(proponent);
        uint256 id = registry.registerProject(META, community);
        vm.expectRevert(abi.encodeWithSelector(ProjectRegistry.InvalidCellCount.selector, 0));
        registry.addCells(id, new uint64[](0));
        vm.expectRevert(abi.encodeWithSelector(ProjectRegistry.InvalidCellCount.selector, 101));
        registry.addCells(id, cells(0, 101));
        vm.stopPrank();
    }

    function test_addCells_revertsForNonOwnerOrUnknownProject() public {
        vm.prank(proponent);
        uint256 id = registry.registerProject(META, community);

        vm.expectRevert(abi.encodeWithSelector(ProjectRegistry.NotProjectOwner.selector, id, proponent2));
        vm.prank(proponent2);
        registry.addCells(id, cells(0, 1));

        vm.expectRevert(abi.encodeWithSelector(ProjectRegistry.UnknownProject.selector, 99));
        vm.prank(proponent);
        registry.addCells(99, cells(0, 1));
    }

    function test_addCells_rejectsMalformedCells() public {
        vm.prank(proponent);
        uint256 id = registry.registerProject(META, community);

        uint64[5] memory bad = [
            uint64(0), // empty
            0x0897540000007FFF, // resolution 9
            0x08A7540000007FFE, // unused digit not 7
            0x10A7540000007FFF, // mode 2 (directed edge)
            0x88A7540000007FFF // reserved high bit set
        ];
        for (uint256 i; i < bad.length; ++i) {
            uint64[] memory batch = new uint64[](1);
            batch[0] = bad[i];
            vm.expectRevert(abi.encodeWithSelector(ProjectRegistry.InvalidCell.selector, bad[i]));
            vm.prank(proponent);
            registry.addCells(id, batch);
        }
    }

    function test_isValidCell_acceptsRealH3Index() public view {
        // 8a754e64992ffff: a real resolution-10 cell from h3-js.
        assertTrue(registry.isValidCell(0x08a754e64992ffff));
        assertFalse(registry.isValidCell(0x089754e64993ffff)); // res 9 cell
    }

    // ---------------------------------------------------------------------------------------------
    // F3 - anti-overlap
    // ---------------------------------------------------------------------------------------------

    function test_addCells_rejectsCellOwnedByAnotherActiveProject() public {
        uint256 first = registerWithCells(proponent, 0, 5);

        vm.startPrank(proponent2);
        registry.registerProject(META, community);
        vm.expectRevert(abi.encodeWithSelector(ProjectRegistry.CellAlreadyClaimed.selector, cell(4), first));
        registry.addCells(2, cells(4, 3));
        vm.stopPrank();

        // Atomic: no partial claim of cells 5 and 6.
        assertEq(registry.projectOfCell(cell(5)), 0);
        assertEq(registry.getProject(2).cellCount, 0);
    }

    function test_addCells_rejectsDuplicatesInsideBatchAndAcrossCalls() public {
        vm.startPrank(proponent);
        uint256 id = registry.registerProject(META, community);
        uint64[] memory dup = new uint64[](2);
        dup[0] = cell(7);
        dup[1] = cell(7);
        vm.expectRevert(abi.encodeWithSelector(ProjectRegistry.CellAlreadyClaimed.selector, cell(7), id));
        registry.addCells(id, dup);

        registry.addCells(id, cells(7, 1));
        vm.expectRevert(abi.encodeWithSelector(ProjectRegistry.CellAlreadyClaimed.selector, cell(7), id));
        registry.addCells(id, cells(7, 1));
        vm.stopPrank();
    }

    function test_closeProject_freesCellsForOtherProjects() public {
        uint256 first = registerWithCells(proponent, 0, 5);

        vm.expectEmit(address(registry));
        emit ProjectRegistry.ProjectClosed(first, admin);
        vm.prank(admin);
        registry.closeProject(first);

        assertEq(registry.projectOfCell(cell(0)), 0);
        uint256 second = registerWithCells(proponent2, 0, 5);
        assertEq(registry.projectOfCell(cell(0)), second);
    }

    function test_closeProject_blocksFurtherCells() public {
        uint256 id = registerWithCells(proponent, 0, 1);
        vm.prank(admin);
        registry.closeProject(id);

        vm.expectRevert(abi.encodeWithSelector(ProjectRegistry.ProjectNotActive.selector, id));
        vm.prank(proponent);
        registry.addCells(id, cells(10, 1));

        vm.expectRevert(abi.encodeWithSelector(ProjectRegistry.ProjectNotActive.selector, id));
        vm.prank(admin);
        registry.closeProject(id);
    }

    function test_closeProject_onlyAdmin() public {
        uint256 id = registerWithCells(proponent, 0, 1);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                proponent,
                registry.DEFAULT_ADMIN_ROLE()
            )
        );
        vm.prank(proponent);
        registry.closeProject(id);

        vm.expectRevert(abi.encodeWithSelector(ProjectRegistry.UnknownProject.selector, 42));
        vm.prank(admin);
        registry.closeProject(42);
    }

    // ---------------------------------------------------------------------------------------------
    // Emergency pause
    // ---------------------------------------------------------------------------------------------

    function test_pause_blocksWritesAndOnlyAdminUnpauses() public {
        vm.prank(pauser);
        registry.pause();

        vm.expectRevert(Pausable.EnforcedPause.selector);
        vm.prank(proponent);
        registry.registerProject(META, community);

        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                pauser,
                registry.DEFAULT_ADMIN_ROLE()
            )
        );
        vm.prank(pauser);
        registry.unpause();

        vm.prank(admin);
        registry.unpause();
        vm.prank(proponent);
        registry.registerProject(META, community);
    }

    // ---------------------------------------------------------------------------------------------
    // Fuzz
    // ---------------------------------------------------------------------------------------------

    /// @dev Two projects can never hold the same cell while both are active.
    function testFuzz_overlapAlwaysRejected(uint256 a, uint256 b, uint8 countA, uint8 countB) public {
        countA = uint8(bound(countA, 1, 100));
        countB = uint8(bound(countB, 1, 100));
        a = bound(a, 0, 1000);
        b = bound(b, 0, 1000);

        registerWithCells(proponent, a, countA);
        vm.startPrank(proponent2);
        uint256 second = registry.registerProject(META, community);
        bool overlaps = b < a + countA && a < b + countB;
        if (overlaps) vm.expectPartialRevert(ProjectRegistry.CellAlreadyClaimed.selector);
        registry.addCells(second, cells(b, countB));
        vm.stopPrank();

        if (!overlaps) assertEq(registry.getProject(second).cellCount, countB);
    }

    function testFuzz_randomIntegersMostlyInvalid(uint64 raw) public view {
        bool valid = registry.isValidCell(raw);
        if (valid) {
            assertEq(raw >> 56, 0x08);
            assertEq((raw >> 52) & 0xF, 10);
            assertEq(raw & 0x7FFF, 0x7FFF);
        }
    }
}

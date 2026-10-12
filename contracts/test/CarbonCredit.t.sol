// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC1155Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

import {CarbonCredit} from "../src/CarbonCredit.sol";
import {DateUtils} from "../src/libraries/DateUtils.sol";
import {BaseTest} from "./utils/BaseTest.sol";

contract CarbonCreditTest is BaseTest {
    uint256 internal projectId;
    uint256 internal tokenId;

    function setUp() public override {
        super.setUp();
        (projectId,, tokenId) = issuedProject();
    }

    function test_issue_onlyVerification() public {
        vm.expectRevert(abi.encodeWithSelector(CarbonCredit.NotVerification.selector, admin));
        vm.prank(admin);
        credit.issue(admin, tokenId, 1, 100, 25);
    }

    function test_tokenIdEncoding() public view {
        assertEq(credit.encodeTokenId(projectId, 2027), tokenId);
        assertEq(credit.projectOf(tokenId), projectId);
    }

    function test_buffer_cannotBeMovedOrRetired() public {
        address pool = credit.BUFFER_POOL();
        vm.startPrank(pool);
        vm.expectRevert(CarbonCredit.BufferLocked.selector);
        credit.safeTransferFrom(pool, buyer, tokenId, 1, "");
        vm.expectRevert(CarbonCredit.BufferLocked.selector);
        credit.retire(tokenId, 1, buyer, bytes32(0));
        vm.stopPrank();
        assertEq(credit.bufferOf(tokenId), 190);
    }

    function test_retire_burnsAndEmitsCertificate() public {
        bytes32 reason = keccak256("retirement statement");

        vm.expectEmit(address(credit));
        emit CarbonCredit.CreditsRetired(1, proponent, tokenId, 100, buyer, reason);
        vm.prank(proponent);
        uint256 retirementId = credit.retire(tokenId, 100, buyer, reason);

        assertEq(retirementId, 1);
        assertEq(credit.balanceOf(proponent, tokenId), 662);
        assertEq(credit.totalRetired(tokenId), 100);
        assertEq(credit.totalIssued(tokenId), 952);
    }

    function test_retire_cannotExceedBalanceOrBeRepeated() public {
        vm.startPrank(proponent);
        credit.retire(tokenId, 762, buyer, bytes32(0));
        vm.expectRevert(
            abi.encodeWithSelector(
                IERC1155Errors.ERC1155InsufficientBalance.selector, proponent, 0, 1, tokenId
            )
        );
        credit.retire(tokenId, 1, buyer, bytes32(0));
        vm.stopPrank();
    }

    function test_retire_rejectsZeroValues() public {
        vm.startPrank(proponent);
        vm.expectRevert(CarbonCredit.ZeroAmount.selector);
        credit.retire(tokenId, 0, buyer, bytes32(0));
        vm.expectRevert(CarbonCredit.ZeroAddress.selector);
        credit.retire(tokenId, 1, address(0), bytes32(0));
        vm.stopPrank();
    }

    function test_pause_freezesTransfersAndRetirements() public {
        vm.prank(pauser);
        credit.pause();
        vm.startPrank(proponent);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        credit.safeTransferFrom(proponent, buyer, tokenId, 1, "");
        vm.expectRevert(Pausable.EnforcedPause.selector);
        credit.retire(tokenId, 1, buyer, bytes32(0));
        vm.stopPrank();
    }

    function test_issue_rejectsZeroNet() public {
        vm.expectRevert(CarbonCredit.ZeroAmount.selector);
        vm.prank(address(verification));
        credit.issue(proponent, tokenId, 1, 0, 10);
    }

    function test_setURI_onlyAdmin() public {
        vm.prank(admin);
        credit.setURI("ipfs://new/{id}.json");
        assertEq(credit.uri(tokenId), "ipfs://new/{id}.json");

        vm.expectRevert();
        vm.prank(proponent);
        credit.setURI("ipfs://evil/{id}.json");
    }

    function test_unpause_restoresTransfers() public {
        vm.prank(pauser);
        credit.pause();
        vm.prank(admin);
        credit.unpause();
        vm.prank(proponent);
        credit.safeTransferFrom(proponent, buyer, tokenId, 1, "");
        assertEq(credit.balanceOf(buyer, tokenId), 1);
    }

    function test_metadata() public view {
        assertEq(credit.name(), "BlueRoot Verified Hectare-Year");
        assertEq(credit.symbol(), "BRHY");
        assertTrue(credit.supportsInterface(0xd9b67a26)); // ERC-1155
        assertTrue(credit.supportsInterface(0x7965db0b)); // AccessControl
    }

    function testFuzz_retiredCreditsAreGone(uint256 amount, uint256 moveAfter) public {
        amount = bound(amount, 1, 762);
        moveAfter = bound(moveAfter, 1, 762);
        vm.startPrank(proponent);
        credit.retire(tokenId, amount, buyer, bytes32(0));
        uint256 left = 762 - amount;
        if (moveAfter > left) {
            vm.expectRevert(
                abi.encodeWithSelector(
                    IERC1155Errors.ERC1155InsufficientBalance.selector, proponent, left, moveAfter, tokenId
                )
            );
        }
        credit.safeTransferFrom(proponent, buyer, tokenId, moveAfter, "");
        vm.stopPrank();
    }
}

contract DateUtilsTest is BaseTest {
    function test_yearOf_knownDates() public pure {
        assertEq(DateUtils.yearOf(0), 1970);
        assertEq(DateUtils.yearOf(951_782_399), 2000); // 2000-02-28T23:59:59Z
        assertEq(DateUtils.yearOf(1_767_225_599), 2025); // 2025-12-31T23:59:59Z
        assertEq(DateUtils.yearOf(1_767_225_600), 2026); // 2026-01-01T00:00:00Z
        assertEq(DateUtils.yearOf(1_798_761_599), 2026); // 2026-12-31T23:59:59Z
        assertEq(DateUtils.yearOf(1_798_761_600), 2027);
        assertEq(DateUtils.yearOf(4_107_542_400), 2100); // 2100-03-01, non-leap century
    }

    /// @dev Cross-check against a slow reference that walks year lengths.
    function testFuzz_yearOf_matchesReference(uint32 ts) public pure {
        uint256 year = 1970;
        uint256 t = ts;
        while (true) {
            uint256 len = (year % 4 == 0 && (year % 100 != 0 || year % 400 == 0)) ? 366 days : 365 days;
            if (t < len) break;
            t -= len;
            ++year;
        }
        assertEq(DateUtils.yearOf(ts), year);
    }
}

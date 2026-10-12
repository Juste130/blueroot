// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

import {Verification} from "../src/Verification.sol";
import {BaseTest} from "./utils/BaseTest.sol";

contract VerificationTest is BaseTest {
    uint256 internal projectId;

    function setUp() public override {
        super.setUp();
        projectId = registerWithCells(proponent, 0, 10);
        vm.warp(START + 365 days);
    }

    // ---------------------------------------------------------------------------------------------
    // Anchoring
    // ---------------------------------------------------------------------------------------------

    function test_anchorReport_storesImmutableClaim() public {
        uint256 end = START + 365 days;
        vm.expectEmit(address(verification));
        emit Verification.ReportAnchored(1, projectId, REPORT, SATELLITE, 80, START, end, 952, end + 14 days);
        uint256 claimId = anchorClaim(projectId, 80, START, end);

        Verification.Claim memory c = verification.getClaim(claimId);
        assertEq(c.projectId, projectId);
        assertEq(c.quantity, 952); // 10 cells * 119 * 1 year * 0.80
        assertEq(c.score, 80);
        assertEq(c.reportHash, REPORT);
        assertEq(c.satelliteHash, SATELLITE);
        assertEq(uint8(c.status), uint8(Verification.ClaimStatus.Pending));
        assertEq(verification.openClaimOf(projectId), claimId);
    }

    function test_anchorReport_onlyAnchorRole() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                proponent,
                verification.ANCHOR_ROLE()
            )
        );
        vm.prank(proponent);
        verification.anchorReport(projectId, REPORT, SATELLITE, 80, START, START + 1 days);
    }

    function test_anchorReport_rejectsLowOrInvalidScore() public {
        vm.startPrank(anchor);
        vm.expectRevert(abi.encodeWithSelector(Verification.ScoreBelowThreshold.selector, 69, 70));
        verification.anchorReport(projectId, REPORT, SATELLITE, 69, START, START + 1 days);
        vm.expectRevert(abi.encodeWithSelector(Verification.InvalidScore.selector, 101));
        verification.anchorReport(projectId, REPORT, SATELLITE, 101, START, START + 1 days);
        vm.stopPrank();
    }

    function test_anchorReport_rejectsEmptyHashes() public {
        vm.startPrank(anchor);
        vm.expectRevert(Verification.InvalidHash.selector);
        verification.anchorReport(projectId, bytes32(0), SATELLITE, 80, START, START + 1 days);
        vm.expectRevert(Verification.InvalidHash.selector);
        verification.anchorReport(projectId, REPORT, bytes32(0), 80, START, START + 1 days);
        vm.stopPrank();
    }

    function test_anchorReport_rejectsInvalidPeriods() public {
        uint256 nowTs = block.timestamp;
        vm.startPrank(anchor);
        // before registration
        vm.expectRevert(abi.encodeWithSelector(Verification.InvalidPeriod.selector, START - 1, nowTs));
        verification.anchorReport(projectId, REPORT, SATELLITE, 80, START - 1, nowTs);
        // empty period
        vm.expectRevert(abi.encodeWithSelector(Verification.InvalidPeriod.selector, START, START));
        verification.anchorReport(projectId, REPORT, SATELLITE, 80, START, START);
        // future end
        vm.expectRevert(abi.encodeWithSelector(Verification.InvalidPeriod.selector, START, nowTs + 1));
        verification.anchorReport(projectId, REPORT, SATELLITE, 80, START, nowTs + 1);
        vm.stopPrank();
    }

    function test_anchorReport_rejectsProjectWithoutCellsOrClosed() public {
        vm.prank(proponent);
        uint256 empty = registry.registerProject(META, community);
        vm.expectRevert(abi.encodeWithSelector(Verification.ProjectHasNoCells.selector, empty));
        anchorClaim(empty, 80, block.timestamp - 1 days, block.timestamp);

        vm.prank(admin);
        registry.closeProject(projectId);
        vm.expectRevert(abi.encodeWithSelector(Verification.ProjectNotActive.selector, projectId));
        anchorClaim(projectId, 80, START, START + 1 days);
    }

    function test_anchorReport_rejectsTinyQuantity() public {
        // 10 cells * 119 * 60s * 70 / (365 days * 100) rounds down to 0
        vm.expectRevert(Verification.QuantityIsZero.selector);
        anchorClaim(projectId, 70, START, START + 60);
    }

    function test_anchorReport_onlyOneOpenClaimPerProject() public {
        uint256 first = anchorClaim(projectId, 80, START, START + 100 days);
        vm.expectRevert(abi.encodeWithSelector(Verification.ClaimStillOpen.selector, first));
        anchorClaim(projectId, 80, START + 100 days, START + 200 days);

        // Approved but not finalized still blocks.
        approveTwice(first);
        vm.expectRevert(abi.encodeWithSelector(Verification.ClaimStillOpen.selector, first));
        anchorClaim(projectId, 80, START + 100 days, START + 200 days);
    }

    function test_anchorReport_expiredClaimUnblocksProject() public {
        uint256 first = anchorClaim(projectId, 80, START, START + 100 days);
        vm.warp(block.timestamp + 14 days + 1);
        assertTrue(verification.isExpired(first));
        // Same period can be claimed again since nothing was issued.
        uint256 second = anchorClaim(projectId, 80, START, START + 100 days);
        assertEq(verification.openClaimOf(projectId), second);
    }

    /// @dev Temporal double counting: a finalized period can never be claimed again.
    function test_anchorReport_periodsCannotOverlapFinalizedOnes() public {
        uint256 first = anchorClaim(projectId, 80, START, START + 200 days);
        approveTwice(first);
        verification.finalize(first);
        assertEq(verification.claimedUntil(projectId), START + 200 days);

        vm.expectRevert(
            abi.encodeWithSelector(Verification.InvalidPeriod.selector, START + 199 days, START + 300 days)
        );
        anchorClaim(projectId, 80, START + 199 days, START + 300 days);

        anchorClaim(projectId, 80, START + 200 days, START + 300 days);
    }

    // ---------------------------------------------------------------------------------------------
    // F7 - attestations
    // ---------------------------------------------------------------------------------------------

    function test_attest_twoApprovalsApprove() public {
        uint256 claimId = anchorClaim(projectId, 80, START, START + 365 days);

        vm.prank(validator1);
        verification.attest(claimId, REPORT, true);
        assertEq(uint8(verification.getClaim(claimId).status), uint8(Verification.ClaimStatus.Pending));

        vm.expectEmit(address(verification));
        emit Verification.ClaimApproved(claimId);
        vm.prank(validator2);
        verification.attest(claimId, REPORT, true);
        assertEq(uint8(verification.getClaim(claimId).status), uint8(Verification.ClaimStatus.Approved));
    }

    function test_attest_twoRejectionsReject() public {
        uint256 claimId = anchorClaim(projectId, 80, START, START + 365 days);
        vm.prank(validator1);
        verification.attest(claimId, REPORT, false);
        vm.prank(validator3);
        verification.attest(claimId, REPORT, true);

        vm.expectEmit(address(verification));
        emit Verification.ClaimRejected(claimId);
        vm.prank(validator2);
        verification.attest(claimId, REPORT, false);

        assertEq(uint8(verification.getClaim(claimId).status), uint8(Verification.ClaimStatus.Rejected));
        assertEq(verification.openClaimOf(projectId), 0);

        vm.expectRevert(abi.encodeWithSelector(Verification.ClaimNotApproved.selector, claimId));
        verification.finalize(claimId);
    }

    function test_attest_voteBoundToReportHash() public {
        uint256 claimId = anchorClaim(projectId, 80, START, START + 365 days);
        bytes32 tampered = keccak256("tampered-report");
        vm.expectRevert(abi.encodeWithSelector(Verification.ReportMismatch.selector, REPORT, tampered));
        vm.prank(validator1);
        verification.attest(claimId, tampered, true);
    }

    function test_attest_noDoubleVote() public {
        uint256 claimId = anchorClaim(projectId, 80, START, START + 365 days);
        vm.startPrank(validator1);
        verification.attest(claimId, REPORT, true);
        vm.expectRevert(abi.encodeWithSelector(Verification.AlreadyVoted.selector, claimId, validator1));
        verification.attest(claimId, REPORT, false);
        vm.stopPrank();
    }

    function test_attest_noSelfValidation() public {
        vm.startPrank(admin);
        verification.grantRole(verification.VALIDATOR_ROLE(), proponent);
        verification.grantRole(verification.VALIDATOR_ROLE(), community);
        vm.stopPrank();
        uint256 claimId = anchorClaim(projectId, 80, START, START + 365 days);

        vm.expectRevert(abi.encodeWithSelector(Verification.SelfValidation.selector, projectId, proponent));
        vm.prank(proponent);
        verification.attest(claimId, REPORT, true);

        vm.expectRevert(abi.encodeWithSelector(Verification.SelfValidation.selector, projectId, community));
        vm.prank(community);
        verification.attest(claimId, REPORT, true);
    }

    function test_attest_onlyValidatorsWithinWindow() public {
        uint256 claimId = anchorClaim(projectId, 80, START, START + 365 days);

        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, buyer, verification.VALIDATOR_ROLE()
            )
        );
        vm.prank(buyer);
        verification.attest(claimId, REPORT, true);

        vm.warp(block.timestamp + 14 days + 1);
        vm.expectRevert(abi.encodeWithSelector(Verification.ValidationWindowClosed.selector, claimId));
        vm.prank(validator1);
        verification.attest(claimId, REPORT, true);
    }

    function test_attest_closedOnceApproved() public {
        uint256 claimId = anchorClaim(projectId, 80, START, START + 365 days);
        approveTwice(claimId);
        vm.expectRevert(abi.encodeWithSelector(Verification.ClaimNotPending.selector, claimId));
        vm.prank(validator3);
        verification.attest(claimId, REPORT, false);
    }

    // ---------------------------------------------------------------------------------------------
    // F8 - finalize and issuance
    // ---------------------------------------------------------------------------------------------

    function test_finalize_issuesNetAndBuffer() public {
        uint256 claimId = anchorClaim(projectId, 80, START, START + 365 days);
        approveTwice(claimId);
        uint256 tokenId = (projectId << 16) | 2027;

        vm.expectEmit(address(verification));
        emit Verification.ClaimFinalized(claimId, projectId, tokenId, 762, 190);
        vm.prank(buyer); // permissionless
        verification.finalize(claimId);

        assertEq(credit.balanceOf(proponent, tokenId), 762);
        assertEq(credit.bufferOf(tokenId), 190);
        assertEq(credit.totalIssued(tokenId), 952);
        assertEq(verification.openClaimOf(projectId), 0);
    }

    function test_finalize_onlyOnce() public {
        uint256 claimId = anchorClaim(projectId, 80, START, START + 365 days);
        approveTwice(claimId);
        verification.finalize(claimId);
        vm.expectRevert(abi.encodeWithSelector(Verification.ClaimNotApproved.selector, claimId));
        verification.finalize(claimId);
    }

    function test_finalize_requiresApproval() public {
        uint256 claimId = anchorClaim(projectId, 80, START, START + 365 days);
        vm.prank(validator1);
        verification.attest(claimId, REPORT, true);
        vm.expectRevert(abi.encodeWithSelector(Verification.ClaimNotApproved.selector, claimId));
        verification.finalize(claimId);
    }

    function test_finalize_revertsIfProjectClosed() public {
        uint256 claimId = anchorClaim(projectId, 80, START, START + 365 days);
        approveTwice(claimId);
        vm.prank(admin);
        registry.closeProject(projectId);
        vm.expectRevert(abi.encodeWithSelector(Verification.ProjectNotActive.selector, projectId));
        verification.finalize(claimId);
    }

    // ---------------------------------------------------------------------------------------------
    // Governance
    // ---------------------------------------------------------------------------------------------

    function test_setParams_boundedByContract() public {
        Verification.Params memory p = Verification.Params({
            requiredApprovals: 3,
            scoreThreshold: 75,
            bufferBps: 2500,
            validationWindow: 7 days,
            cellAreaCentiHa: 151
        });
        vm.prank(admin);
        verification.setParams(p);
        (uint8 approvals,,,,) = verification.params();
        assertEq(approvals, 3);

        p.requiredApprovals = 1;
        vm.expectRevert(Verification.InvalidParams.selector);
        vm.prank(admin);
        verification.setParams(p);

        p.requiredApprovals = 2;
        p.bufferBps = 500;
        vm.expectRevert(Verification.InvalidParams.selector);
        vm.prank(admin);
        verification.setParams(p);

        p.bufferBps = 2000;
        p.scoreThreshold = 40;
        vm.expectRevert(Verification.InvalidParams.selector);
        vm.prank(admin);
        verification.setParams(p);
    }

    function test_pause_blocksLifecycle() public {
        uint256 claimId = anchorClaim(projectId, 80, START, START + 365 days);
        vm.prank(pauser);
        verification.pause();

        vm.expectRevert(Pausable.EnforcedPause.selector);
        vm.prank(validator1);
        verification.attest(claimId, REPORT, true);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        anchorClaim(projectId, 80, START, START + 1 days);
    }

    function test_unpause_restoresLifecycle() public {
        uint256 claimId = anchorClaim(projectId, 80, START, START + 365 days);
        vm.prank(pauser);
        verification.pause();
        vm.prank(admin);
        verification.unpause();
        approveTwice(claimId);
        verification.finalize(claimId);
        assertEq(uint8(verification.getClaim(claimId).status), uint8(Verification.ClaimStatus.Finalized));
    }

    // ---------------------------------------------------------------------------------------------
    // Fuzz
    // ---------------------------------------------------------------------------------------------

    /// @dev Issuance never exceeds the business rule, and buffer + net == quantity.
    function testFuzz_issuanceMatchesBusinessRule(uint256 score, uint256 duration) public {
        score = bound(score, 70, 100);
        duration = bound(duration, 1 days, 365 days);
        uint256 claimId = anchorClaim(projectId, score, START, START + duration);
        uint256 expected = 10 * 119 * duration * score / (365 days * 100);
        assertEq(verification.getClaim(claimId).quantity, expected);

        approveTwice(claimId);
        verification.finalize(claimId);
        uint256 tokenId = (projectId << 16) | (duration == 365 days ? 2027 : 2026);
        assertEq(credit.balanceOf(proponent, tokenId) + credit.bufferOf(tokenId), expected);
        assertEq(credit.bufferOf(tokenId), expected * 2000 / 10_000);
    }
}

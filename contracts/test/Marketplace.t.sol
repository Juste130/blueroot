// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

import {Marketplace} from "../src/Marketplace.sol";
import {BaseTest} from "./utils/BaseTest.sol";

contract MarketplaceTest is BaseTest {
    uint256 internal tokenId;
    uint256 internal constant PRICE = 2_500_000; // 2.50 tUSDC per 0.01 ha-year

    function setUp() public override {
        super.setUp();
        (,, tokenId) = issuedProject();

        vm.prank(proponent);
        credit.setApprovalForAll(address(market), true);

        vm.startPrank(buyer);
        usdc.faucet();
        usdc.approve(address(market), type(uint256).max);
        vm.stopPrank();
    }

    function _list(uint256 amount, uint256 price) internal returns (uint256 id) {
        vm.prank(proponent);
        id = market.list(tokenId, amount, price);
    }

    function test_list_escrowsCredits() public {
        vm.expectEmit(address(market));
        emit Marketplace.Listed(1, proponent, tokenId, 500, PRICE);
        uint256 id = _list(500, PRICE);

        assertEq(credit.balanceOf(address(market), tokenId), 500);
        assertEq(credit.balanceOf(proponent, tokenId), 460);
        Marketplace.Listing memory l = market.getListing(id);
        assertEq(l.seller, proponent);
        assertEq(l.amount, 500);
        assertEq(l.unitPrice, PRICE);
    }

    function test_list_rejectsZeroAndOverflow() public {
        vm.startPrank(proponent);
        vm.expectRevert(Marketplace.ZeroAmount.selector);
        market.list(tokenId, 0, PRICE);
        vm.expectRevert(Marketplace.ZeroAmount.selector);
        market.list(tokenId, 1, 0);
        vm.expectRevert(Marketplace.ValueTooLarge.selector);
        market.list(tokenId, 1, uint256(type(uint128).max) + 1);
        vm.stopPrank();
    }

    function test_buy_splitsPaymentAtomically() public {
        uint256 id = _list(500, PRICE);
        uint256 total = 100 * PRICE; // 250 tUSDC

        vm.expectEmit(address(market));
        emit Marketplace.Purchased(
            id, buyer, tokenId, 100, total, total / 2, total * 2 / 100, total * 48 / 100
        );
        vm.prank(buyer);
        market.buy(id, 100, PRICE);

        assertEq(usdc.balanceOf(community), total / 2);
        assertEq(usdc.balanceOf(treasury), total * 2 / 100);
        assertEq(usdc.balanceOf(proponent), total * 48 / 100);
        assertEq(usdc.balanceOf(address(market)), 0);
        assertEq(credit.balanceOf(buyer, tokenId), 100);
        assertEq(market.getListing(id).amount, 400);
    }

    function test_buy_guardsAgainstPriceAndAmount() public {
        uint256 id = _list(10, PRICE);
        vm.startPrank(buyer);
        vm.expectRevert(abi.encodeWithSelector(Marketplace.PriceMismatch.selector, PRICE - 1, PRICE));
        market.buy(id, 1, PRICE - 1);
        vm.expectRevert(abi.encodeWithSelector(Marketplace.InsufficientListing.selector, id, 10, 11));
        market.buy(id, 11, PRICE);
        vm.expectRevert(Marketplace.ZeroAmount.selector);
        market.buy(id, 0, PRICE);
        vm.expectRevert(abi.encodeWithSelector(Marketplace.ListingNotFound.selector, 99));
        market.buy(99, 1, PRICE);
        vm.stopPrank();
    }

    function test_buyerCanRetirePurchasedCredits() public {
        uint256 id = _list(50, PRICE);
        vm.startPrank(buyer);
        market.buy(id, 50, PRICE);
        credit.retire(tokenId, 50, buyer, keccak256("offset 2026"));
        vm.stopPrank();
        assertEq(credit.balanceOf(buyer, tokenId), 0);
        assertEq(credit.totalRetired(tokenId), 50);
    }

    function test_cancel_returnsRemainingCredits() public {
        uint256 id = _list(500, PRICE);
        vm.prank(buyer);
        market.buy(id, 100, PRICE);

        vm.expectRevert(abi.encodeWithSelector(Marketplace.NotSeller.selector, id, buyer));
        vm.prank(buyer);
        market.cancel(id);

        vm.expectEmit(address(market));
        emit Marketplace.Cancelled(id, 400);
        vm.prank(proponent);
        market.cancel(id);
        assertEq(credit.balanceOf(proponent, tokenId), 860);

        vm.expectRevert(abi.encodeWithSelector(Marketplace.ListingNotFound.selector, id));
        vm.prank(buyer);
        market.buy(id, 1, PRICE);
    }

    function test_pause_blocksTradingButNotCancel() public {
        uint256 id = _list(10, PRICE);
        vm.prank(pauser);
        market.pause();

        vm.expectRevert(Pausable.EnforcedPause.selector);
        vm.prank(buyer);
        market.buy(id, 1, PRICE);

        vm.prank(proponent);
        market.cancel(id);
        assertEq(credit.balanceOf(proponent, tokenId), 960);
    }

    function test_cancel_unknownListing() public {
        vm.expectRevert(abi.encodeWithSelector(Marketplace.ListingNotFound.selector, 7));
        vm.prank(proponent);
        market.cancel(7);
    }

    function test_unpause_restoresTrading() public {
        uint256 id = _list(10, PRICE);
        vm.prank(pauser);
        market.pause();
        vm.prank(admin);
        market.unpause();
        vm.prank(buyer);
        market.buy(id, 10, PRICE);
        assertEq(credit.balanceOf(buyer, tokenId), 10);
    }

    function test_supportsInterface() public view {
        assertTrue(market.supportsInterface(0x4e2312e0)); // ERC1155Receiver
        assertTrue(market.supportsInterface(0x7965db0b)); // AccessControl
    }

    function test_setFees_bounded() public {
        vm.startPrank(admin);
        vm.expectRevert(abi.encodeWithSelector(Marketplace.InvalidFee.selector, 501));
        market.setFees(501, 5000, treasury);
        vm.expectRevert(abi.encodeWithSelector(Marketplace.InvalidCommunityShare.selector, 4999));
        market.setFees(200, 4999, treasury);
        vm.expectRevert(abi.encodeWithSelector(Marketplace.InvalidCommunityShare.selector, 9900));
        market.setFees(200, 9900, treasury);
        vm.expectRevert(Marketplace.ZeroAddress.selector);
        market.setFees(200, 5000, address(0));
        market.setFees(500, 9500, treasury);
        vm.stopPrank();

        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                proponent,
                market.DEFAULT_ADMIN_ROLE()
            )
        );
        vm.prank(proponent);
        market.setFees(0, 5000, treasury);
    }

    // ---------------------------------------------------------------------------------------------
    // Fuzz - invariant 4: community share is never below the guaranteed minimum
    // ---------------------------------------------------------------------------------------------

    function testFuzz_quote_communityAtLeastMinimum(uint128 price, uint96 amount, uint16 fee, uint16 share)
        public
    {
        fee = uint16(bound(fee, 0, 500));
        share = uint16(bound(share, 5000, 10_000 - fee));
        vm.prank(admin);
        market.setFees(fee, share, treasury);

        uint256 p = bound(price, 1, 1e30);
        uint256 a = bound(amount, 1, 1e9);
        (uint256 total, uint256 c, uint256 f, uint256 s) = market.quote(p, a);
        assertEq(c + f + s, total, "split sums to total");
        assertGe(c * 10_000, total * 5000, "community >= 50%");
        assertGe(c * 10_000, total * share, "community >= configured share");
        assertLe(f * 10_000, total * 500, "fee <= cap");
    }

    function testFuzz_buy_endToEnd(uint256 amount, uint256 price) public {
        amount = bound(amount, 1, 960);
        price = bound(price, 1, 10_000e6 / amount);
        uint256 id = _list(amount, price);

        vm.prank(buyer);
        market.buy(id, amount, price);

        uint256 total = amount * price;
        assertGe(usdc.balanceOf(community) * 2, total);
        assertEq(usdc.balanceOf(community) + usdc.balanceOf(treasury) + usdc.balanceOf(proponent), total);
        assertEq(credit.balanceOf(buyer, tokenId), amount);
    }
}

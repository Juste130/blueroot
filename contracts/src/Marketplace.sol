// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {
    AccessControlDefaultAdminRules
} from "@openzeppelin/contracts/access/extensions/AccessControlDefaultAdminRules.sol";
import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import {ERC1155Holder} from "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {IProjectRegistry} from "./interfaces/IProjectRegistry.sol";

/// @title Marketplace
/// @author BlueRoot
/// @notice Fixed-price marketplace for BlueRoot credits, paid in a stablecoin.
/// @dev - Listed credits are held in escrow, so a listing can always be filled.
///      - Every purchase splits the payment atomically from the buyer: community share (rounded UP, so it
///        is never below the guaranteed minimum), platform fee (rounded down, capped), remainder to seller.
///      - No funds are ever held by this contract.
contract Marketplace is AccessControlDefaultAdminRules, Pausable, ReentrancyGuard, ERC1155Holder {
    using SafeERC20 for IERC20;

    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    uint256 private constant BPS = 10_000;
    /// @notice Guaranteed minimum community share of every sale (50 %).
    uint256 public constant MIN_COMMUNITY_BPS = 5000;
    /// @notice Hard cap on the platform fee (5 %).
    uint256 public constant MAX_FEE_BPS = 500;

    /// @dev Two slots: (seller, amount) and (tokenId, unitPrice).
    struct Listing {
        address seller;
        uint96 amount; // remaining units in escrow
        uint64 tokenId;
        uint128 unitPrice; // payment token base units per credit unit
    }

    IERC1155 public immutable CREDIT;
    IERC20 public immutable PAYMENT_TOKEN;
    IProjectRegistry public immutable REGISTRY;

    address public treasury;
    uint16 public feeBps;
    uint16 public communityBps;
    uint256 public listingCount;

    mapping(uint256 listingId => Listing) private _listings;

    error ZeroAddress();
    error ZeroAmount();
    error InvalidFee(uint256 feeBps);
    error InvalidCommunityShare(uint256 communityBps);
    error ListingNotFound(uint256 listingId);
    error NotSeller(uint256 listingId, address caller);
    error InsufficientListing(uint256 listingId, uint256 available, uint256 requested);
    error PriceMismatch(uint256 expected, uint256 provided);
    error ValueTooLarge();

    event Listed(
        uint256 indexed listingId,
        address indexed seller,
        uint256 indexed tokenId,
        uint256 amount,
        uint256 unitPrice
    );
    event Purchased(
        uint256 indexed listingId,
        address indexed buyer,
        uint256 indexed tokenId,
        uint256 amount,
        uint256 totalPrice,
        uint256 communityAmount,
        uint256 feeAmount,
        uint256 sellerAmount
    );
    event Cancelled(uint256 indexed listingId, uint256 returnedAmount);
    event FeesUpdated(uint256 feeBps, uint256 communityBps, address treasury);

    constructor(
        address admin,
        uint48 adminDelay,
        IERC1155 credit,
        IERC20 paymentToken,
        IProjectRegistry registry,
        address treasury_
    ) AccessControlDefaultAdminRules(adminDelay, admin) {
        if (
            address(credit) == address(0) || address(paymentToken) == address(0)
                || address(registry) == address(0)
        ) {
            revert ZeroAddress();
        }
        CREDIT = credit;
        PAYMENT_TOKEN = paymentToken;
        REGISTRY = registry;
        // casting to 'uint16' is safe because MIN_COMMUNITY_BPS is a constant below 2^16.
        // forge-lint: disable-next-line(unsafe-typecast)
        _setFees(200, uint16(MIN_COMMUNITY_BPS), treasury_);
    }

    // ---------------------------------------------------------------------------------------------
    // Trading
    // ---------------------------------------------------------------------------------------------

    /// @notice List `amount` credits of `tokenId` at `unitPrice`. Credits move into escrow.
    /// @dev Requires `setApprovalForAll(marketplace, true)` on the credit contract.
    function list(uint256 tokenId, uint256 amount, uint256 unitPrice)
        external
        whenNotPaused
        nonReentrant
        returns (uint256 listingId)
    {
        if (amount == 0 || unitPrice == 0) revert ZeroAmount();
        if (amount > type(uint96).max || unitPrice > type(uint128).max || tokenId > type(uint64).max) {
            revert ValueTooLarge();
        }

        unchecked {
            listingId = ++listingCount;
        }
        // casting is safe because every value was range-checked just above.
        // forge-lint: disable-start(unsafe-typecast)
        _listings[listingId] = Listing({
            seller: msg.sender,
            amount: uint96(amount),
            tokenId: uint64(tokenId),
            unitPrice: uint128(unitPrice)
        });
        // forge-lint: disable-end(unsafe-typecast)
        emit Listed(listingId, msg.sender, tokenId, amount, unitPrice);

        CREDIT.safeTransferFrom(msg.sender, address(this), tokenId, amount, "");
    }

    /// @notice Buy `amount` credits from a listing.
    /// @param maxUnitPrice Price the buyer agreed to (guards against stale UI data).
    function buy(uint256 listingId, uint256 amount, uint256 maxUnitPrice)
        external
        whenNotPaused
        nonReentrant
    {
        Listing storage listing = _listings[listingId];
        address seller = listing.seller;
        if (seller == address(0)) revert ListingNotFound(listingId);
        if (amount == 0) revert ZeroAmount();
        uint256 available = listing.amount;
        if (amount > available) revert InsufficientListing(listingId, available, amount);
        uint256 unitPrice = listing.unitPrice;
        if (unitPrice > maxUnitPrice) revert PriceMismatch(maxUnitPrice, unitPrice);
        uint256 tokenId = listing.tokenId;

        // Effects
        unchecked {
            // casting to 'uint96' is safe because amount <= available, which was read from a uint96.
            // forge-lint: disable-next-line(unsafe-typecast)
            listing.amount = uint96(available - amount);
        }

        // Interactions
        _settlePayment(listingId, seller, tokenId, amount, unitPrice);
        CREDIT.safeTransferFrom(address(this), msg.sender, tokenId, amount, "");
    }

    /// @notice Cancel a listing and get the remaining credits back. Allowed while paused.
    function cancel(uint256 listingId) external nonReentrant {
        Listing storage listing = _listings[listingId];
        address seller = listing.seller;
        if (seller == address(0)) revert ListingNotFound(listingId);
        if (seller != msg.sender) revert NotSeller(listingId, msg.sender);

        uint256 remaining = listing.amount;
        uint256 tokenId = listing.tokenId;
        delete _listings[listingId];
        emit Cancelled(listingId, remaining);

        if (remaining != 0) CREDIT.safeTransferFrom(address(this), seller, tokenId, remaining, "");
    }

    // ---------------------------------------------------------------------------------------------
    // Governance
    // ---------------------------------------------------------------------------------------------

    function setFees(uint16 newFeeBps, uint16 newCommunityBps, address newTreasury)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        _setFees(newFeeBps, newCommunityBps, newTreasury);
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

    /// @notice Payment split for `amount` credits at `unitPrice`.
    function quote(uint256 unitPrice, uint256 amount)
        public
        view
        returns (uint256 total, uint256 community, uint256 fee, uint256 sellerAmount)
    {
        total = unitPrice * amount;
        community = Math.mulDiv(total, communityBps, BPS, Math.Rounding.Ceil);
        fee = total * feeBps / BPS;
        // ceil(a) + floor(b) = ceil(a + floor(b)) <= ceil(a + b) <= total, since communityBps + feeBps <= BPS.
        sellerAmount = total - community - fee;
    }

    function getListing(uint256 listingId) external view returns (Listing memory) {
        return _listings[listingId];
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(AccessControlDefaultAdminRules, ERC1155Holder)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    /// @dev Pulls the payment directly from the buyer to each recipient: the contract never holds funds.
    function _settlePayment(
        uint256 listingId,
        address seller,
        uint256 tokenId,
        uint256 amount,
        uint256 unitPrice
    ) private {
        (uint256 total, uint256 community, uint256 fee, uint256 sellerAmount) = quote(unitPrice, amount);
        emit Purchased(listingId, msg.sender, tokenId, amount, total, community, fee, sellerAmount);

        PAYMENT_TOKEN.safeTransferFrom(msg.sender, REGISTRY.communityOf(tokenId >> 16), community);
        if (fee != 0) PAYMENT_TOKEN.safeTransferFrom(msg.sender, treasury, fee);
        if (sellerAmount != 0) PAYMENT_TOKEN.safeTransferFrom(msg.sender, seller, sellerAmount);
    }

    function _setFees(uint16 newFeeBps, uint16 newCommunityBps, address newTreasury) private {
        if (newTreasury == address(0)) revert ZeroAddress();
        if (newFeeBps > MAX_FEE_BPS) revert InvalidFee(newFeeBps);
        if (newCommunityBps < MIN_COMMUNITY_BPS || uint256(newCommunityBps) + newFeeBps > BPS) {
            revert InvalidCommunityShare(newCommunityBps);
        }
        feeBps = newFeeBps;
        communityBps = newCommunityBps;
        treasury = newTreasury;
        emit FeesUpdated(newFeeBps, newCommunityBps, newTreasury);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {CommonBase} from "forge-std/Base.sol";
import {StdCheats} from "forge-std/StdCheats.sol";
import {StdUtils} from "forge-std/StdUtils.sol";

import {CarbonCredit} from "../../src/CarbonCredit.sol";
import {Marketplace} from "../../src/Marketplace.sol";
import {ProjectRegistry} from "../../src/ProjectRegistry.sol";
import {Verification} from "../../src/Verification.sol";
import {IProjectRegistry} from "../../src/interfaces/IProjectRegistry.sol";
import {MockUSDC} from "../../src/mocks/MockUSDC.sol";

/// @dev Drives random but meaningful sequences of actions and records ghost variables.
contract Handler is CommonBase, StdCheats, StdUtils {
    uint64 internal constant CELL_BASE = 0x08A7540000007FFF;
    uint256 internal constant CELL_SPACE = 64; // small space => many collisions attempts
    bytes32 internal constant REPORT = keccak256("report");

    ProjectRegistry internal registry;
    Verification internal verification;
    CarbonCredit internal credit;
    Marketplace internal market;
    MockUSDC internal usdc;
    address internal admin;

    address[] public proponents;
    address[] public validators;
    address[] public holders;
    address public anchor;
    address public communityWallet;

    // Ghosts
    mapping(uint256 projectId => uint64[]) internal _cellsOf;
    uint256[] public tokenIds;
    mapping(uint256 tokenId => bool) internal _knownToken;
    mapping(uint256 claimId => uint256) public finalizeCount;
    uint256 public ghostNetIssued;
    uint256 public ghostBufferIssued;
    uint256 public ghostRetired;
    uint256 public ghostPaid;
    uint256 public ghostCommunityReceived;
    uint256 public selfValidations;

    constructor(
        ProjectRegistry registry_,
        Verification verification_,
        CarbonCredit credit_,
        Marketplace market_,
        MockUSDC usdc_,
        address admin_,
        address anchor_,
        address community_,
        address[] memory proponents_,
        address[] memory validators_
    ) {
        registry = registry_;
        verification = verification_;
        credit = credit_;
        market = market_;
        usdc = usdc_;
        admin = admin_;
        anchor = anchor_;
        communityWallet = community_;
        proponents = proponents_;
        validators = validators_;
        holders = proponents_;
        for (uint256 i; i < validators_.length; ++i) {
            bool known;
            for (uint256 j; j < holders.length; ++j) {
                if (holders[j] == validators_[i]) known = true;
            }
            if (!known) holders.push(validators_[i]);
        }
    }

    // ---------------------------------------------------------------------------------------------
    // Actions
    // ---------------------------------------------------------------------------------------------

    function register(uint256 actorSeed) external {
        vm.prank(_pick(proponents, actorSeed));
        registry.registerProject(keccak256(abi.encode(actorSeed)), communityWallet);
    }

    function addCells(uint256 projectSeed, uint256 from, uint256 count) external {
        uint256 projectId = _project(projectSeed);
        if (projectId == 0) return;
        count = bound(count, 1, 8);
        from = bound(from, 0, CELL_SPACE);
        uint64[] memory batch = new uint64[](count);
        for (uint256 i; i < count; ++i) {
            batch[i] = CELL_BASE | (uint64((from + i) % CELL_SPACE) << 15);
        }
        vm.prank(registry.getProject(projectId).owner);
        try registry.addCells(projectId, batch) {
            for (uint256 i; i < count; ++i) {
                _cellsOf[projectId].push(batch[i]);
            }
        } catch {}
    }

    function close(uint256 projectSeed) external {
        uint256 projectId = _project(projectSeed);
        if (projectId == 0) return;
        vm.prank(admin);
        try registry.closeProject(projectId) {} catch {}
    }

    function anchorReport(uint256 projectSeed, uint256 score, uint256 duration) external {
        uint256 projectId = _project(projectSeed);
        if (projectId == 0) return;
        vm.warp(block.timestamp + bound(duration, 1 days, 200 days));
        uint256 floor = verification.claimedUntil(projectId);
        uint256 registeredAt = registry.getProject(projectId).registeredAt;
        if (floor < registeredAt) floor = registeredAt;
        vm.prank(anchor);
        try verification.anchorReport(
            projectId, REPORT, keccak256("sat"), bound(score, 70, 100), floor, block.timestamp
        ) {}
            catch {}
    }

    function attest(uint256 claimSeed, uint256 validatorSeed, uint256 voteSeed) external {
        bool approve = voteSeed % 4 != 0; // biased to approve so claims reach issuance
        uint256 count = verification.claimCount();
        if (count == 0) return;
        uint256 claimId = bound(claimSeed, 1, count);
        address validator = _pick(validators, validatorSeed);
        vm.prank(validator);
        try verification.attest(claimId, REPORT, approve) {
            (address owner, address community,,,) =
                registry.projectCore(verification.getClaim(claimId).projectId);
            if (validator == owner || validator == community) ++selfValidations;
        } catch {}
    }

    function finalize(uint256 claimSeed) external {
        uint256 count = verification.claimCount();
        if (count == 0) return;
        uint256 claimId = bound(claimSeed, 1, count);
        Verification.Claim memory c = verification.getClaim(claimId);
        try verification.finalize(claimId) {
            ++finalizeCount[claimId];
            uint256 buffer = uint256(c.quantity) * 2000 / 10_000;
            ghostBufferIssued += buffer;
            ghostNetIssued += c.quantity - buffer;
            _trackTokens();
        } catch {}
    }

    function listAndBuy(uint256 holderSeed, uint256 tokenSeed, uint256 amount, uint256 price) external {
        if (tokenIds.length == 0) return;
        uint256 tokenId = tokenIds[tokenSeed % tokenIds.length];
        (address seller, uint256 balance) = _holderWithBalance(holderSeed, tokenId);
        if (balance == 0) return;
        amount = bound(amount, 1, balance);
        price = bound(price, 1, 1e12);

        vm.startPrank(seller);
        credit.setApprovalForAll(address(market), true);
        uint256 listingId = market.list(tokenId, amount, price);
        vm.stopPrank();

        address buyer = _pick(holders, holderSeed % holders.length + 1);
        uint256 total = amount * price;
        deal(address(usdc), buyer, usdc.balanceOf(buyer) + total);
        uint256 communityBefore = usdc.balanceOf(communityWallet);
        vm.startPrank(buyer);
        usdc.approve(address(market), total);
        market.buy(listingId, amount, price);
        vm.stopPrank();

        ghostPaid += total;
        ghostCommunityReceived += usdc.balanceOf(communityWallet) - communityBefore;
    }

    function retire(uint256 holderSeed, uint256 tokenSeed, uint256 amount) external {
        if (tokenIds.length == 0) return;
        uint256 tokenId = tokenIds[tokenSeed % tokenIds.length];
        (address holder, uint256 balance) = _holderWithBalance(holderSeed, tokenId);
        if (balance == 0) return;
        amount = bound(amount, 1, balance);
        vm.prank(holder);
        credit.retire(tokenId, amount, holder, bytes32(0));
        ghostRetired += amount;
    }

    function transfer(uint256 fromSeed, uint256 toSeed, uint256 tokenSeed, uint256 amount) external {
        if (tokenIds.length == 0) return;
        uint256 tokenId = tokenIds[tokenSeed % tokenIds.length];
        (address from, uint256 balance) = _holderWithBalance(fromSeed, tokenId);
        if (balance == 0) return;
        vm.prank(from);
        credit.safeTransferFrom(from, _pick(holders, toSeed), tokenId, bound(amount, 1, balance), "");
    }

    // ---------------------------------------------------------------------------------------------
    // Views for invariants
    // ---------------------------------------------------------------------------------------------

    function cellsOf(uint256 projectId) external view returns (uint64[] memory) {
        return _cellsOf[projectId];
    }

    function tokenCount() external view returns (uint256) {
        return tokenIds.length;
    }

    function holderCount() external view returns (uint256) {
        return holders.length;
    }

    // ---------------------------------------------------------------------------------------------
    // Internal
    // ---------------------------------------------------------------------------------------------

    function _trackTokens() internal {
        uint256 count = registry.projectCount();
        for (uint256 p = 1; p <= count; ++p) {
            for (uint256 y = 2026; y <= 2040; ++y) {
                uint256 id = (p << 16) | y;
                if (!_knownToken[id] && credit.totalIssued(id) != 0) {
                    _knownToken[id] = true;
                    tokenIds.push(id);
                }
            }
        }
    }

    /// @dev First holder with a positive balance, starting from a random position.
    function _holderWithBalance(uint256 seed, uint256 tokenId) internal view returns (address, uint256) {
        uint256 n = holders.length;
        for (uint256 i; i < n; ++i) {
            address h = holders[(seed % n + i) % n];
            uint256 balance = credit.balanceOf(h, tokenId);
            if (balance != 0) return (h, balance);
        }
        return (address(0), 0);
    }

    function _project(uint256 seed) internal view returns (uint256) {
        uint256 count = registry.projectCount();
        return count == 0 ? 0 : bound(seed, 1, count);
    }

    function _pick(address[] storage list, uint256 seed) internal view returns (address) {
        return list[seed % list.length];
    }
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {CarbonCredit} from "../src/CarbonCredit.sol";
import {Marketplace} from "../src/Marketplace.sol";
import {ProjectRegistry} from "../src/ProjectRegistry.sol";
import {Verification} from "../src/Verification.sol";
import {ICarbonCredit} from "../src/interfaces/ICarbonCredit.sol";
import {IProjectRegistry} from "../src/interfaces/IProjectRegistry.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";

/// @title Deploy
/// @notice Deploys the BlueRoot system and writes `deployments/<chainId>.json` for the app.
/// @dev Usage (keystore account, never a raw private key in env):
///   forge script script/Deploy.s.sol --rpc-url base_sepolia --account deployer --sender <addr> \
///     --broadcast --verify
/// Environment (all optional):
///   ADMIN_ADDRESS     governance multisig receiving the admin role (two-step). Defaults to deployer.
///   TREASURY_ADDRESS  platform fee recipient. Defaults to ADMIN_ADDRESS.
///   ANCHOR_ADDRESS    server wallet allowed to anchor reports.
///   VALIDATORS        comma-separated validator addresses.
///   PROPONENTS        comma-separated proponent addresses.
///   PAYMENT_TOKEN     existing stablecoin; a MockUSDC is deployed when unset (testnet only).
///   ADMIN_DELAY       seconds before a new admin can accept (default 1 day).
///   CREDIT_URI        ERC-1155 metadata URI template.
contract Deploy is Script {
    struct Deployment {
        ProjectRegistry registry;
        CarbonCredit credit;
        Verification verification;
        Marketplace market;
        address paymentToken;
    }

    function run() external returns (Deployment memory d) {
        address deployer = msg.sender;
        address admin = vm.envOr("ADMIN_ADDRESS", deployer);
        address treasury = vm.envOr("TREASURY_ADDRESS", admin);
        address anchor = vm.envOr("ANCHOR_ADDRESS", address(0));
        address[] memory validators = vm.envOr("VALIDATORS", ",", new address[](0));
        address[] memory proponents = vm.envOr("PROPONENTS", ",", new address[](0));
        address paymentToken = vm.envOr("PAYMENT_TOKEN", address(0));
        uint48 delay = uint48(vm.envOr("ADMIN_DELAY", uint256(1 days)));
        string memory uri = vm.envOr("CREDIT_URI", string("https://blueroot.app/api/credits/{id}"));

        vm.startBroadcast(deployer);

        if (paymentToken == address(0)) paymentToken = address(new MockUSDC());

        // The deployer is admin only while wiring roles, then hands over to governance.
        d.registry = new ProjectRegistry(deployer, delay);
        address predicted = vm.computeCreateAddress(deployer, vm.getNonce(deployer) + 1);
        d.credit = new CarbonCredit(deployer, delay, predicted, uri);
        d.verification = new Verification(
            deployer, delay, IProjectRegistry(address(d.registry)), ICarbonCredit(address(d.credit))
        );
        require(address(d.verification) == predicted, "Deploy: verification address mismatch");
        d.market = new Marketplace(
            deployer, delay, d.credit, IERC20(paymentToken), IProjectRegistry(address(d.registry)), treasury
        );
        d.paymentToken = paymentToken;

        if (anchor != address(0)) d.verification.grantRole(d.verification.ANCHOR_ROLE(), anchor);
        for (uint256 i; i < validators.length; ++i) {
            d.verification.grantRole(d.verification.VALIDATOR_ROLE(), validators[i]);
        }
        for (uint256 i; i < proponents.length; ++i) {
            d.registry.grantRole(d.registry.PROPONENT_ROLE(), proponents[i]);
        }
        d.registry.grantRole(d.registry.PAUSER_ROLE(), admin);
        d.verification.grantRole(d.verification.PAUSER_ROLE(), admin);
        d.credit.grantRole(d.credit.PAUSER_ROLE(), admin);
        d.market.grantRole(d.market.PAUSER_ROLE(), admin);

        if (admin != deployer) {
            d.registry.beginDefaultAdminTransfer(admin);
            d.verification.beginDefaultAdminTransfer(admin);
            d.credit.beginDefaultAdminTransfer(admin);
            d.market.beginDefaultAdminTransfer(admin);
        }

        vm.stopBroadcast();

        _write(d, admin);
    }

    function _write(Deployment memory d, address admin) internal {
        string memory key = "deployment";
        vm.serializeUint(key, "chainId", block.chainid);
        vm.serializeUint(key, "startBlock", block.number);
        vm.serializeAddress(key, "admin", admin);
        vm.serializeAddress(key, "projectRegistry", address(d.registry));
        vm.serializeAddress(key, "carbonCredit", address(d.credit));
        vm.serializeAddress(key, "verification", address(d.verification));
        vm.serializeAddress(key, "marketplace", address(d.market));
        string memory json = vm.serializeAddress(key, "paymentToken", d.paymentToken);

        string memory path = string.concat("deployments/", vm.toString(block.chainid), ".json");
        vm.writeJson(json, path);
        console2.log("Deployment written to", path);
    }
}

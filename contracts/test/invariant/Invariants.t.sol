// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IProjectRegistry} from "../../src/interfaces/IProjectRegistry.sol";
import {BaseTest} from "../utils/BaseTest.sol";
import {Handler} from "./Handler.sol";

/// @notice The six invariants of the specification (section 8), checked after random action sequences.
contract InvariantsTest is BaseTest {
    Handler internal handler;

    function setUp() public override {
        super.setUp();

        address[] memory proponents = new address[](2);
        proponents[0] = proponent;
        proponents[1] = proponent2;
        address[] memory validators = new address[](4);
        validators[0] = validator1;
        validators[1] = validator2;
        validators[2] = validator3;
        validators[3] = proponent; // also a validator: must never validate its own project

        bytes32 validatorRole = verification.VALIDATOR_ROLE();
        vm.prank(admin);
        verification.grantRole(validatorRole, proponent);

        handler = new Handler(
            registry, verification, credit, market, usdc, admin, anchor, community, proponents, validators
        );
        targetContract(address(handler));
    }

    /// @dev Invariant 1: a cell belongs to at most one active project.
    function invariant_cellBelongsToOneActiveProject() public view {
        uint256 count = registry.projectCount();
        for (uint256 p = 1; p <= count; ++p) {
            (,,, IProjectRegistry.ProjectStatus status,) = registry.projectCore(p);
            if (status != IProjectRegistry.ProjectStatus.Active) continue;
            uint64[] memory owned = handler.cellsOf(p);
            for (uint256 i; i < owned.length; ++i) {
                assertEq(registry.projectOfCell(owned[i]), p, "cell owned by another active project");
            }
            assertEq(registry.getProject(p).cellCount, owned.length, "cell count drift");
        }
    }

    /// @dev Invariant 2: a claim is finalized at most once.
    function invariant_claimFinalizedOnce() public view {
        uint256 count = verification.claimCount();
        for (uint256 c = 1; c <= count; ++c) {
            assertLe(handler.finalizeCount(c), 1, "claim finalized twice");
        }
    }

    /// @dev Invariant 3: total issued = buffer + net, and every issued unit is held, buffered or retired.
    function invariant_issuedEqualsBufferPlusNet() public view {
        uint256 issued;
        uint256 buffered;
        uint256 held;
        uint256 retired;
        for (uint256 t; t < handler.tokenCount(); ++t) {
            uint256 id = handler.tokenIds(t);
            issued += credit.totalIssued(id);
            buffered += credit.bufferOf(id);
            retired += credit.totalRetired(id);
            held += credit.balanceOf(address(market), id);
            for (uint256 h; h < handler.holderCount(); ++h) {
                held += credit.balanceOf(handler.holders(h), id);
            }
        }
        assertEq(issued, handler.ghostNetIssued() + handler.ghostBufferIssued(), "issued != net + buffer");
        assertEq(buffered, handler.ghostBufferIssued(), "buffer moved");
        assertEq(issued, held + buffered + retired, "supply leak");
    }

    /// @dev Invariant 4: the community always receives at least the guaranteed minimum (50 %).
    function invariant_communityShareAtLeastMinimum() public view {
        assertGe(handler.ghostCommunityReceived() * 2, handler.ghostPaid(), "community below minimum");
        assertEq(usdc.balanceOf(address(market)), 0, "marketplace holds funds");
    }

    /// @dev Invariant 5: retired credits are burned and can never move again.
    function invariant_retiredCreditsAreBurned() public view {
        uint256 retired;
        for (uint256 t; t < handler.tokenCount(); ++t) {
            retired += credit.totalRetired(handler.tokenIds(t));
        }
        assertEq(retired, handler.ghostRetired(), "retired mismatch");
    }

    /// @dev Invariant 6: a validator never validates its own project.
    function invariant_noSelfValidation() public view {
        assertEq(handler.selfValidations(), 0, "self validation accepted");
    }
}

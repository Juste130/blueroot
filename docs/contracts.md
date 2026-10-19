# BlueRoot smart contracts

Solidity 0.8.28 · OpenZeppelin 5.4.0 · Foundry · target network: Polygon Amoy (testnet only; Base Sepolia also configured).

## Architecture

```
ProjectRegistry ──(projectCore, communityOf)──► Verification ──(issue, immutable)──► CarbonCredit (ERC-1155)
       ▲                                                                                  │
       └──────────────(communityOf)────────── Marketplace ◄──(escrow, safeTransferFrom)───┘
                                                   │
                                          MockUSDC / stablecoin (SafeERC20)
```

| Contract | Spec | Role |
|---|---|---|
| `ProjectRegistry` | F1, F2, F3 | Projects, H3 cells, spatial uniqueness, closing |
| `Verification` | F6, F7, F8 | Report anchoring, two-validator attestation, finalization |
| `CarbonCredit` | F8, F10 | ERC-1155 credits, locked buffer pool, retirement |
| `Marketplace` | F9 | Fixed-price escrow sales with enforced payment split |
| `MockUSDC` | F9 | Testnet stablecoin with rate-limited faucet |

All contracts are **non-upgradeable** (spec 7.3), use `AccessControlDefaultAdminRules` (two-step admin transfer with a delay, single admin, designed for a multisig) and `Pausable` (a `PAUSER_ROLE` can pause quickly; only the admin can unpause).

## Roles

| Role | Contract | Holder |
|---|---|---|
| `DEFAULT_ADMIN_ROLE` | all | Governance multisig (Safe) |
| `PAUSER_ROLE` | all | Multisig / guardian |
| `PROPONENT_ROLE` | ProjectRegistry | Onboarded communities and NGOs |
| `ANCHOR_ROLE` | Verification | App server wallet (anchoring only) |
| `VALIDATOR_ROLE` | Verification | Independent experts |
| issuer | CarbonCredit | `Verification` address, **immutable** (no role) |

## Design decisions

1. **O(1) project closing.** `cellOwner[cell]` is only honoured while the owning project is active. Closing a project frees all its cells without iterating (spec 10.2: bounded loops).
2. **Registration is role-gated.** Permissionless registration would let anyone squat cells for free and block real projects.
3. **Cheap on-chain H3 sanity check.** Mode, reserved bits, resolution 10, base cell < 122, unused digits = 7. Full validation stays off-chain (h3-js).
4. **Immutable issuer.** `CarbonCredit.VERIFICATION` is set at deployment (address predicted with `CREATE`). Even a compromised admin cannot add a minter.
5. **Buffer pool.** Minted to a keyless address; every movement out of it reverts (`BufferLocked`). Buffer credits are visible on-chain but can never be sold or retired.
6. **Anti double counting in time** (complements the spatial rule). Monitoring periods of a project never overlap a finalized one and never start before registration. Only one claim per project can be open.
7. **Claim state machine.** `Pending → Approved → Finalized` or `Pending → Rejected`. Expiry is derived (`deadline`), so no keeper is needed. An expired claim does not block a new one; nothing was issued.
8. **Quantity enforced on-chain.** `units (0.01 ha-year) = cells × cellArea × years × score / 100`, computed at anchoring and stored in the immutable claim.
9. **Marketplace never holds funds.** Payment is pulled from the buyer straight to community, treasury and seller. Credits are escrowed, so a listing can always be filled. The community share is rounded **up**: `ceil(a) + floor(b) ≤ ceil(a + b) ≤ total`, so the split can never overflow and the community never gets less than its share.
10. **Real cell area.** `cellAreaCentiHa` defaults to 119: an H3 res-10 cell is ~1.19 ha on the Benin coast (1.5 ha is only the global average). Rounded down so the contract never over-issues. See [satellite.md](satellite.md).
11. **Bounded governance.** Every parameter has hard limits in code (approvals 2-7, threshold ≥ 50, buffer 10-50 %, window 1-90 days, fee ≤ 5 %, community ≥ 50 %).

### Deviations from the spec signatures (deliberate)

| Spec | Implemented | Why |
|---|---|---|
| `attest(claimId, approve)` | `attest(claimId, reportHash, approve)` | F7 requires the vote to be bound to the reviewed report hash; a vote on another hash reverts (`ReportMismatch`) |
| `anchorReport(projectId, reportHash, satelliteHash, score)` | `+ periodStart, periodEnd` | Needed to compute hectare-years and to prevent temporal double counting |
| `retire(tokenId, amount, beneficiary, reasonHash)` | `beneficiary` is an `address` | No personal data on-chain (10.5). The name lives in the IPFS document behind `reasonHash` |
| `buy(listingId, amount)` | `+ maxUnitPrice` | Protects buyers against stale UI data |

## Invariants (spec section 8) — `test/invariant/`

| # | Invariant | Test |
|---|---|---|
| 1 | A cell belongs to at most one active project | `invariant_cellBelongsToOneActiveProject` |
| 2 | A claim is finalized at most once | `invariant_claimFinalizedOnce` |
| 3 | Total issued = buffer + net (and no supply leak) | `invariant_issuedEqualsBufferPlusNet` |
| 4 | Community share ≥ minimum | `invariant_communityShareAtLeastMinimum` |
| 5 | A retired credit can never move again | `invariant_retiredCreditsAreBurned` |
| 6 | No self-validation | `invariant_noSelfValidation` |

Run with `fail_on_revert = true`: the handler never hits an unexpected revert. Probe tests confirmed the fuzzer reaches issuance, sales and retirements (not just shallow states).

## Test results

75 tests: unit, fuzz (1,000 runs; 10,000 in the `ci` profile), invariants (256 runs × 64 calls).

| File | Lines | Branches |
|---|---|---|
| ProjectRegistry | 100 % | 100 % |
| Verification | ~98 % | ~95 % |
| Marketplace | ~95 % | ~90 % |
| CarbonCredit | ~95 % | ~85 % |
| DateUtils | 100 % | 100 % |

## Gas (optimizer 10,000 runs, median)

| Function | Gas | Note |
|---|---|---|
| `registerProject` | ~99k | 3 storage slots |
| `addCells` | ~22.6k per cell | one cold SSTORE per cell, unavoidable |
| `anchorReport` | ~157k | 3-slot claim + open-claim pointer |
| `attest` | ~29k / ~71k | first vote / vote reaching the threshold |
| `finalize` | ~153k | includes 2 ERC-1155 mints |
| `list` | ~137k | escrow transfer |
| `buy` | ~166k | 3 stablecoin transfers + credit transfer |
| `retire` | ~80k | burn + counters + event |

Full report: `make gas` (writes `gas-report.txt` and `.gas-snapshot`).

## Commands

```bash
cd contracts
make deps        # install pinned forge-std v1.17.0 and OpenZeppelin v5.4.0
make test        # all tests
make test-ci     # deeper fuzzing
make coverage
make slither     # requires slither-analyzer
cast wallet import deployer --interactive   # once; never put a key in .env
make deploy-sepolia
```

The deploy script writes `deployments/<chainId>.json`, read by the app.

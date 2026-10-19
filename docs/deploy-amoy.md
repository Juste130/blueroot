# Deploying to Polygon Amoy

Polygon Amoy (chain id 80002) is the public demo network. Every key stays on the operator's machine:
the deployer lives in an encrypted Foundry keystore, and the app only ever holds the anchoring key,
which has `ANCHOR_ROLE` and nothing else.

## 1. Wallets

| Role | Holds | POL needed |
|---|---|---|
| Deployer | Foundry keystore `deployer` | ~1 (deployment ≈ 10.3 M gas) |
| Proponent | MetaMask | ~0.1 |
| Validator A, Validator B | MetaMask | ~0.1 each |
| Anchor | `ANCHOR_PRIVATE_KEY` on the server | ~0.2 |
| Admin (optional) | Safe multisig | 0 |

```bash
cast wallet import deployer --interactive   # paste the key, choose a password
cast wallet address --account deployer
```

Funds come from the Polygon faucet (https://faucet.polygon.technology); the deployer then tops up the
other wallets.

## 2. Deploy

```bash
cd contracts
export POLYGON_AMOY_RPC_URL=https://rpc-amoy.polygon.technology
export ETHERSCAN_API_KEY=...          # Etherscan V2 key, used for source verification
export ADMIN_ADDRESS=0x...            # Safe; defaults to the deployer when unset
export ANCHOR_ADDRESS=0x...
export VALIDATORS=0x...,0x...
export PROPONENTS=0x...
make deploy-amoy
```

Polygon rejects transactions with a priority fee under 25 gwei, hence `--priority-gas-price 30gwei`.
If Etherscan verification fails, retry it alone with `--verifier sourcify` (no key needed).

The script writes `contracts/deployments/80002.json`; commit it, the app reads its addresses and start
block from there. With a Safe admin, accept the admin role from the Safe after `ADMIN_DELAY`
(`acceptDefaultAdminTransfer` on each of the four contracts).

## 3. App

`app/.env.local` (never committed):

```bash
NEXT_PUBLIC_CHAIN_ID=80002
SESSION_SECRET=...                    # openssl rand -base64 48
PINATA_JWT=...
PINATA_GATEWAY=....mypinata.cloud
ANTHROPIC_API_KEY=...
ANCHOR_PRIVATE_KEY=0x...              # the anchor wallet only
ANCHOR_API_SECRET=...                 # openssl rand -base64 48
```

The same variables go into the hosting provider's environment settings.

# Deploying to Polygon Amoy

Polygon Amoy (chain id 80002) is the public demo network. Every key stays on the operator's machine:
the deployer lives in an encrypted Foundry keystore, and the app only ever holds the anchoring key,
which has `ANCHOR_ROLE` and nothing else.

## 1. Wallets

| Role | Holds | POL needed |
|---|---|---|
| Deployer | Foundry keystore `deployer` | ~0.5 (deployment ≈ 11.3 M gas at ~31 gwei) |
| Proponent | MetaMask | ~0.05 |
| Validator A, Validator B | MetaMask | ~0.02 each |
| Anchor | `ANCHOR_PRIVATE_KEY` on the server | ~0.05 |
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
export POLYGON_AMOY_RPC_URL=https://polygon-amoy.drpc.org   # the official RPC is unreachable from some networks
export ETHERSCAN_API_KEY=...          # Etherscan V2 key, used for source verification
export ADMIN_ADDRESS=0x...            # Safe; defaults to the deployer when unset
export ANCHOR_ADDRESS=0x...
export VALIDATORS=0x...,0x...
export PROPONENTS=0x...
make deploy-amoy
```

Polygon rejects transactions with a priority fee under 25 gwei, hence `--priority-gas-price 30gwei`.
Forge refuses to broadcast unless the balance covers its estimate plus a 30% margin (≈ 0.455 POL);
`--gas-estimate-multiplier 110` narrows the margin when funds are tight. If Etherscan verification fails,
retry it alone with `--verifier sourcify` (no key needed).

The script writes `contracts/deployments/80002.json`; commit it, the app reads its addresses and start
block from there. With a Safe admin, accept the admin role from the Safe after `ADMIN_DELAY`
(`acceptDefaultAdminTransfer` on each of the four contracts).

## 3. App

`.env.local` (never committed):

```bash
NEXT_PUBLIC_CHAIN_ID=80002
SESSION_SECRET=...                    # openssl rand -base64 48
PINATA_JWT=...
PINATA_GATEWAY=....mypinata.cloud
GEMINI_API_KEY=...                    # free key from aistudio.google.com, or ANTHROPIC_API_KEY
ANCHOR_PRIVATE_KEY=0x...              # the anchor wallet only
ANCHOR_API_SECRET=...                 # openssl rand -base64 48
```

The AI report uses Claude when `ANTHROPIC_API_KEY` is set, Gemini otherwise. The provider and the
exact model are recorded in each report.

### Netlify

`netlify.toml` sets the build (Netlify adds its Next.js runtime automatically). In the Netlify UI:

1. **Add new project > Import from Git**, pick the repository; the build settings come from `netlify.toml`.
2. **Project configuration > Environment variables**: the variables above, plus
   `NEXT_PUBLIC_RPC_URL` and `NEXT_PUBLIC_SITE_URL=https://<site>.netlify.app`, scoped to Builds and
   Functions. Mark the server values (keys, JWT, secrets) as secret.
3. Redeploy after any variable change: values are injected at build time.
4. With Privy, add the Netlify domain to the allowed domains.

Documents and evidence go to Pinata: the function file system is read-only, so `PINATA_JWT` is
required in production.

## 4. Privy (optional: email sign-in and sponsored gas)

Without `NEXT_PUBLIC_PRIVY_APP_ID` the app only offers injected wallets (MetaMask). With it, people sign
in with an email (or a wallet), get an embedded wallet, and the platform pays their gas.

In [dashboard.privy.io](https://dashboard.privy.io), for the app:

1. **Allowed domains**: `http://localhost:3000` and the production domain.
2. **Login methods**: email (plus Google or external wallets if wanted).
3. **Fee sponsorship**: turn on "Sponsor gas fees", select Polygon Amoy, allow client-side
   transactions. Sponsorship needs TEE execution for wallets.
4. **Billing**: sponsored gas is drawn from prepaid credits. Check in the dashboard what testnet
   sponsorship costs; the docs only state that mainnets need a saved payment method.

Then `NEXT_PUBLIC_PRIVY_APP_ID=...` in `.env.local` and in the hosting provider. The CSP allows the
Privy origins only when that variable is set.

How it behaves:

- Only embedded wallets are sponsored (EIP-7702 delegation plus a paymaster). People who connect
  MetaMask through Privy still pay their own gas.
- Embedded wallets open the BlueRoot session (SIWE) without a second prompt. The server verifies the
  signature locally first, since a 7702-delegated account would otherwise be checked as a contract.
- Every write is simulated before it is sent, and a sponsored transaction counts as successful only
  if its receipt holds a log from the target contract: the outer transaction can succeed while the
  inner call reverted.
- Roles (proponent, validator) are granted to the embedded wallet's address, shown in the account panel
  after sign-in.

Sources: docs.privy.io, wallets / gas-and-asset-management / gas (setup and overview), usage-billing,
security / content-security-policy.

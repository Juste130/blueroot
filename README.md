<p align="center"><img src="docs/assets/blueroot-logo.svg" alt="BlueRoot" width="420"></p>

<p align="center"><em>Chaque racine compte, chaque preuve aussi. · Every root counts, so does every proof.</em></p>

## FR — BlueRoot

Registre de preuve du carbone bleu pour la restauration communautaire des mangroves au sud du Bénin : unicité spatiale on-chain (cellules H3), preuve à deux sources (terrain + satellite), rapport IA consultatif, double validation humaine, réserve tampon, part communauté garantie par contrat et certificats de retrait publics.

## EN — BlueRoot

Open-source proof registry for community mangrove restoration in Benin: on-chain spatial uniqueness (H3 cells), two-source evidence (field + satellite), advisory AI report, two-validator attestation, buffer pool, contract-enforced community revenue share and public retirement certificates.

> Testnet only. Credits are verified hectare-years of mangrove, not certified CO2 offsets.

## Repository

| Folder | Content | Status |
|---|---|---|
| `contracts/` | Solidity + Foundry: registry, verification, credits, marketplace | ✅ Module 1 |
| `scripts/satellite/` | NDVI pipeline and versioned demo data | ⏳ Module 2 |
| `app/` | Next.js application (App Router, wagmi/viem) | ⏳ Module 3 |
| `docs/` | Specification, contract design, architecture | ✅ |

- Specification: [docs/BlueRoot-cahier-des-charges-et-architecture.md](docs/BlueRoot-cahier-des-charges-et-architecture.md)
- Contracts: [docs/contracts.md](docs/contracts.md)

## License

MIT

# Pinned dependency versions: bump deliberately, never float.
FORGE_STD_VERSION := v1.17.0
OZ_VERSION        := v5.4.0

.PHONY: deps build test test-ci coverage gas fmt slither deploy-sepolia

deps:
	rm -rf lib/forge-std lib/openzeppelin-contracts
	forge install --no-git foundry-rs/forge-std@$(FORGE_STD_VERSION)
	forge install --no-git OpenZeppelin/openzeppelin-contracts@$(OZ_VERSION)

build:
	forge build --sizes

test:
	forge test -vv

test-ci:
	FOUNDRY_PROFILE=ci forge test -vv

coverage:
	forge coverage --no-match-coverage "(test|script|mocks)" --report summary --report lcov

gas:
	forge test --gas-report > gas-report.txt && forge snapshot

fmt:
	forge fmt

slither:
	slither . --config-file slither.config.json

deploy-sepolia:
	forge script script/Deploy.s.sol --rpc-url base_sepolia --account deployer --broadcast --verify

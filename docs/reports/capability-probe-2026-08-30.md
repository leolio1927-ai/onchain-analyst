# Capability probe — 2026-08-30 07:10 UTC

Manual run (providers/capability_probe.py). Founder-authorized live calls on
free tiers only. Keys present at run time: HELIUS_API_KEY=True, ALCHEMY_API_KEY=True.

| chain | capability | result | note |
|---|---|---|---|
| sol | deployer | — | helius:create_tx_not_found |
| sol | holders | {"top10_share": 0.385727, "accounts": 20} | None |
| sol | sell_test | {"routable": true, "amount_out": "282330", "checked_via": "jupiter", "note": null} | None |
| bnb | deployer | — | alchemy:http_400 |
| bnb | holders | — | by design: EVM top-holders need an indexer key, alchemy free tier cannot enumerate (probe conclusion) |
| bnb | sell_test | — | 1inch:401 — API key required (probed) |
| base | deployer | — | alchemy:http_400 |
| base | holders | — | by design: EVM top-holders need an indexer key, alchemy free tier cannot enumerate (probe conclusion) |
| base | sell_test | — | 1inch:401 — API key required (probed) |
| avax | deployer | — | alchemy:rpc_-32602 |
| avax | holders | — | by design: EVM top-holders need an indexer key, alchemy free tier cannot enumerate (probe conclusion) |
| avax | sell_test | — | 1inch:401 — API key required (probed) |
| hood | deployer | — | no $0 candidate provider: GT/DS expose no creation, no holders, no quote API |
| hood | holders | — | no $0 candidate provider: GT/DS expose no creation, no holders, no quote API |
| hood | sell_test | — | DEX-less venues: no route concept |
| hype | deployer | — | no $0 candidate provider: GT/DS expose no creation, no holders, no quote API |
| hype | holders | — | no $0 candidate provider: GT/DS expose no creation, no holders, no quote API |
| hype | sell_test | — | DEX-less venues: no route concept |

## Conclusions feeding chains_map.py

- deployer: sol=helius (creation within the last-100 txs of a mint;
  older mints answer helius:create_tx_not_found — honest absence).
  bnb/base/avax=null — PROBED: alchemy_getAssetTransfers rejects
  category 'contract' on these networks (base answered verbatim:
  "Invalid category: 'contract'"); EVM creation lookup needs an
  Etherscan-class indexer. hood/hype=null — no candidate provider.
- holders: sol=helius (LIVE: BONK top10_share 0.385727 via
  getTokenLargestAccounts + getTokenSupply). Every other chain=null —
  top-holder enumeration needs an indexer key alchemy does not offer.
- sell_test: sol=jupiter (LIVE: BONK 1 unit → SOL routed).
  bnb/base/avax=null — 1inch quote requires an API key (401 probed
  unauthenticated). hood/hype=null — DEX-less venues: no route concept.

Fixture idents (tests/fixtures) were NOT live-probed: a synthetic mint
would conflate 'unroutable' with 'does not exist'. They exercise the
offline paths only (DB lineage, data_mode stamping).

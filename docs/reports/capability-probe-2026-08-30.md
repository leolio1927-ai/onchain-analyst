# Capability probe — 2026-08-30 06:03 UTC

Manual run (providers/capability_probe.py). Founder-authorized live calls on
free tiers only. Keys present at run time: HELIUS_API_KEY=False, ALCHEMY_API_KEY=False.

| chain | capability | result | note |
|---|---|---|---|
| sol | deployer | — | helius:not_configured |
| sol | holders | — | helius:not_configured |
| sol | sell_test | {"routable": true, "amount_out": "282104", "checked_via": "jupiter", "note": null} | None |
| bnb | deployer | — | alchemy:not_configured |
| bnb | holders | — | alchemy:not_configured; even with a key, EVM top-holders need an indexer (no enumeration in free RPC) |
| bnb | sell_test | — | 1inch:401 — API key required (probed) |
| base | deployer | — | alchemy:not_configured |
| base | holders | — | alchemy:not_configured; even with a key, EVM top-holders need an indexer (no enumeration in free RPC) |
| base | sell_test | — | 1inch:401 — API key required (probed) |
| avax | deployer | — | alchemy:not_configured |
| avax | holders | — | alchemy:not_configured; even with a key, EVM top-holders need an indexer (no enumeration in free RPC) |
| avax | sell_test | — | 1inch:401 — API key required (probed) |
| hood | deployer | — | no $0 candidate provider: GT/DS expose no creation, no holders, no quote API |
| hood | holders | — | no $0 candidate provider: GT/DS expose no creation, no holders, no quote API |
| hood | sell_test | — | DEX-less venues: no route concept |
| hype | deployer | — | no $0 candidate provider: GT/DS expose no creation, no holders, no quote API |
| hype | holders | — | no $0 candidate provider: GT/DS expose no creation, no holders, no quote API |
| hype | sell_test | — | DEX-less venues: no route concept |

## Conclusions feeding chains_map.py

- deployer: sol=helius, bnb/base/avax=alchemy (code paths implemented;
  runtime without keys reports `<provider>:not_configured`),
  hood/hype=null — GT/DS expose no creation data; an invented zero is the crime.
- holders: sol=helius (getTokenLargestAccounts + getTokenSupply).
  EVM chains=null — top-holder enumeration needs an indexer
  (Etherscan-class) key; alchemy free RPC cannot enumerate. hood/hype=null.
- sell_test: sol=jupiter (keyless, probed live). EVM=null — 1inch quote
  requires an API key (probed unauthenticated). hood/hype=null —
  DEX-less venues have no route concept.

Fixture idents (tests/fixtures) were NOT live-probed: a synthetic mint
would conflate 'unroutable' with 'does not exist'. They exercise the
offline paths only (DB lineage, data_mode stamping).

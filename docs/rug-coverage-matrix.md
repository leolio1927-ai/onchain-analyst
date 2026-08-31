# Rug Check — provider × chain coverage matrix

Dated: 2026-08-31 (re-probed live this session; raw JSON in `logs/v2b-probe-*.json`, gitignored).
Law: zero keys, zero third-party requests from the browser — every provider is
proxied by `webapp/server.py` with envelope + Provenance (source/host/cache/freshness/degraded).

| chain | route | provider | endpoint (probed 2026-08-31) | signals | status |
|---|---|---|---|---|---|
| SOL | `/api/v1/rug/sol/{mint}` | RugCheck.xyz | `GET /v1/tokens/{mint}/report/summary` → 200 @1.03s (BONK) | score, score_normalised, lpLockedPct, risks[]{name,level,score,description} | LIVE |
| BNB (56) | `/api/v1/rug/evm/bnb/{ca}` | GoPlus | `GET /api/v1/token_security/56?contract_addresses=…` → 200 @0.50s (CAKE) | is_honeypot, is_open_source, buy_tax, sell_tax, is_mintable, is_freezable, holder_count, contract_creator — verbatim 0/1-strings | LIVE |
| BASE (8453) | `/api/v1/rug/evm/base/{ca}` | GoPlus | `GET /api/v1/token_security/8453?contract_addresses=…` (AERO probed 2026-08-31, 751137 holders) | same field set as BNB | LIVE |
| HYPE | none | — | free coverage does not index this chain yet | market stats only (price/liq/vol/age via the shared $0 feed) | PARTIAL — reason rendered verbatim |
| HOOD | none | — | free coverage does not index this chain yet | market stats only | PARTIAL — reason rendered verbatim |

Cache: provider-side TTL 300s, capped LRU (64 entries), single-flight per key.
Unsupported chain → HTTP 400 with the documented reason (the FE never calls it
for hype/hood; the limited panel is rendered client-side).
Unindexed token (RugCheck 404) → empty risks + `degraded` reason — a fact, never an invented verdict.

Probe evidence (verbatim, truncated):

```
$ curl "https://api.rugcheck.xyz/v1/tokens/DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263/report/summary"
HTTP 200 in 1.034192s
{"tokenProgram":"TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA","tokenType":"",
 "risks":[{"name":"Mutable metadata","value":"",
   "description":"Token metadata can be changed by the owner","score":100,"level":"warn"}],
 "score":101,"score_normalised":7,"lpLockedPct":23.93276922603007}

$ curl "https://api.gopluslabs.io/api/v1/token_security/56?contract_addresses=0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82"
HTTP 200 in 0.504949s
{"code":1,"message":"OK","result":{"0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82":{
 "anti_whale_modifiable":"0","can_take_back_ownership":"0",
 "creator_address":"0x0f9399fc81dac77908a2dde54bb87ee2d17a3373",
 "creator_balance":"0","creator_percent":"0.000000","external_call":"0",
 "hidden_owner":"0","holder_count":"1909509","holders":[…]}}}
```

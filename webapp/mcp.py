"""Machine surface (PROMPT-V2B P6) — READ-ONLY MCP server, hand-rolled
JSON-RPC 2.0 over one POST endpoint. No SDK: the spec surface we serve is
small (initialize / ping / tools/list / tools/call), stdlib json is enough,
and a dep we cannot audit would break the $0 read-only law.

Spec revision implemented: Model Context Protocol **2026-07-28**
(modelcontextprotocol.io/specification/latest, checked 2026-08-31).

Every tool is a thin read-only wrapper over the SAME functions the REST
surface serves — one truth, two doors. Tool implementations are injected by
webapp/server.py so this module stays import-cycle-free and unit-testable.
"""
from __future__ import annotations

import json
from collections.abc import Awaitable, Callable
from typing import Any

PROTOCOL_VERSION = "2026-07-28"
SERVER_INFO = {"name": "vilmei-read-only", "version": "2.0.0"}
INSTRUCTIONS = ("VILMEI read-only onchain analyst. All tools return live or "
                "declared-null data with provenance; nothing here trades, "
                "custodies, or writes. Context, not an audit.")

ToolImpl = Callable[[dict], Awaitable[Any]]

TOOLS: list[dict] = [
    {
        "name": "trending",
        "description": ("Live memecoin feed per chain from the $0 GeckoTerminal "
                        "wiring (modes: new|trending|volume|alpha). Returns the "
                        "same envelope as GET /api/v1/live/{chain}."),
        "inputSchema": {
            "type": "object",
            "properties": {
                "chain": {"type": "string", "description": "sol|bnb|base|hype|hood"},
                "mode": {"type": "string", "enum": ["new", "trending", "volume", "alpha"]},
                "limit": {"type": "integer", "minimum": 1, "maximum": 50},
            },
            "required": ["chain"],
        },
    },
    {
        "name": "scan",
        "description": ("Token scan verdict: weighted heuristics with verbatim "
                        "evidence + rug flags, identical to POST /api/v1/scan."),
        "inputSchema": {
            "type": "object",
            "properties": {
                "chain": {"type": "string", "description": "sol|bnb|base|hype|hood"},
                "address": {"type": "string", "description": "token contract address (CA)"},
            },
            "required": ["chain", "address"],
        },
    },
    {
        "name": "rug",
        "description": ("Multi-chain rug surface: sol → RugCheck summary; "
                        "bnb/base → GoPlus token_security rows; hype/hood → "
                        "documented no-coverage reason. Same as "
                        "/api/v1/rug/sol/{mint} and /api/v1/rug/evm/{chain}/{ca}."),
        "inputSchema": {
            "type": "object",
            "properties": {
                "chain": {"type": "string", "description": "sol|bnb|base|hype|hood"},
                "address": {"type": "string", "description": "token contract address (CA)"},
            },
            "required": ["chain", "address"],
        },
    },
    {
        "name": "whale_windows",
        "description": ("Large recent transfers + per-wallet netflow for one "
                        "token (sol live via Helius; EVM chains answer the "
                        "declared-null probe reason). Same as "
                        "GET /api/v1/whales/{chain}/{token}."),
        "inputSchema": {
            "type": "object",
            "properties": {
                "chain": {"type": "string", "description": "sol|bnb|base|hype|hood"},
                "token": {"type": "string", "description": "token contract address (CA)"},
                "threshold_usd": {"type": "number", "minimum": 0},
                "limit": {"type": "integer", "minimum": 1, "maximum": 100},
            },
            "required": ["chain", "token"],
        },
    },
    {
        "name": "fee_view",
        "description": ("The PLANNED VILMEI fee (0.50% = ops 0.30 + buyback "
                        "0.10 + rewards 0.10) for one notional on one chain, "
                        "plus that chain's fee path verbatim from "
                        "docs/FEE-MODELS-2026.md. A policy constant — nothing "
                        "is charged; VILMEI is read-only. Same as "
                        "GET /api/v1/fees/estimate."),
        "inputSchema": {
            "type": "object",
            "properties": {
                "chain": {"type": "string", "description": "sol|bnb|base|hype|hood"},
                "amountUsd": {"type": "number", "minimum": 0,
                              "description": "notional in USD (default 1000)"},
            },
            "required": ["chain"],
        },
    },
    {
        "name": "fee_destinations",
        "description": ("The claim-based vault map: per chain, the three fee "
                        "slices (ops/buyback/rewards) with their PUBLIC vault "
                        "address if founder-claimed in .env, else a "
                        "declared-null awaiting-founder sentence. No key "
                        "enters the repo; nothing is charged. Same as "
                        "GET /api/v1/fees/destinations."),
        "inputSchema": {"type": "object", "properties": {}},
    },
    {
        "name": "ai_ask",
        "description": ("VILMEI AI (NVIDIA NIM free tier) with the SAME server-side "
                        "personas, evidence and budget guards as POST /api/v1/ai/ask, "
                        "answered as ONE JSON object — the MCP door is not a stream. "
                        "Send chain+token to get the analyst persona (numbers only "
                        "from terminal evidence); omit them for the guide persona "
                        "(project facts only). Key-off or over budget, the tool says "
                        "so as content (isError:true) — never an HTTP error."),
        "inputSchema": {
            "type": "object",
            "properties": {
                "question": {"type": "string",
                             "description": "the question (≤2000 characters)"},
                "chain": {"type": "string",
                          "description": ("sol|bnb|base|hype|hood — together with "
                                          "token selects the analyst persona")},
                "token": {"type": "string",
                          "description": "token contract address (CA)"},
                "mode": {"type": "string", "enum": ["free", "deep"],
                         "description": "default free"},
            },
            "required": ["question"],
        },
    },
]


def _err(id_: Any, code: int, message: str) -> dict:
    return {"jsonrpc": "2.0", "id": id_, "error": {"code": code, "message": message}}


async def handle(payload: Any, impl: dict[str, ToolImpl]) -> tuple[int, dict | None]:
    """(http_status, jsonrpc_response|None). Notifications answer 202 + None."""
    if not isinstance(payload, dict) or payload.get("jsonrpc") != "2.0":
        return 200, _err(payload.get("id") if isinstance(payload, dict) else None,
                         -32600, "invalid request — expected JSON-RPC 2.0 object")
    id_ = payload.get("id")
    method = payload.get("method")
    params = payload.get("params") or {}
    notification = "id" not in payload

    if method == "initialize":
        return 200, {"jsonrpc": "2.0", "id": id_, "result": {
            "protocolVersion": PROTOCOL_VERSION,
            "capabilities": {"tools": {"listChanged": False}},
            "serverInfo": SERVER_INFO,
            "instructions": INSTRUCTIONS}}
    if method in ("notifications/initialized", "notifications/cancelled"):
        return 202, None
    if method == "ping":
        return 200, {"jsonrpc": "2.0", "id": id_, "result": {}}
    if method == "tools/list":
        return 200, {"jsonrpc": "2.0", "id": id_, "result": {"tools": TOOLS}}
    if method == "tools/call":
        if notification:
            return 202, None
        name = params.get("name")
        args = params.get("arguments") or {}
        fn = impl.get(name) if isinstance(name, str) else None
        if fn is None:
            return 200, _err(id_, -32602,
                             f"unknown tool '{name}' — tools/list is the catalog")
        try:
            out = await fn(args)
            return 200, {"jsonrpc": "2.0", "id": id_, "result": {
                "content": [{"type": "text",
                             "text": json.dumps(out, ensure_ascii=False)}],
                "isError": False}}
        except Exception as e:  # noqa: BLE001 — a tool failure is content, not a 500
            return 200, {"jsonrpc": "2.0", "id": id_, "result": {
                "content": [{"type": "text", "text": f"tool error: {str(e)[:200]}"}],
                "isError": True}}
    if notification:
        return 202, None
    return 200, _err(id_, -32601, f"method not found: {method}")

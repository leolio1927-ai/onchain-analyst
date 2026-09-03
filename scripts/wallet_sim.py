#!/usr/bin/env python3
"""Wallet broadcast simulator (SLOT W-SIM).

Drives one handoff quote from the wallet side against the local backend:

  monitor -> confirm (wallet hash) -> monitor loop -> terminal state.

Exit codes:
  0  settlement reached DEST_CONFIRMED (or the reported confirmation
     count met --confirmations)
  2  settlement FAILED
  3  monitor loop hit --max-wait without a terminal state
  4  quote unknown (monitor/confirm answered 404)
  5  confirm rejected (422 bad hash, 400 wallet mismatch, 409 conflict)
  1  usage / transport error

The server mounts swap routes under /api/v1, so the CLI joins
--base-url + --api-prefix + /swap/... (default http://127.0.0.1:8000 +
/api/v1). Only the standard library is used for HTTP.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.request
from collections.abc import Callable
from typing import Any

EXIT_OK = 0
EXIT_USAGE = 1
EXIT_FAILED = 2
EXIT_TIMEOUT = 3
EXIT_NOT_FOUND = 4
EXIT_CONFIRM_REJECTED = 5

# Pre-confirmation state: the handoff receipt state that still needs a hash.
PENDING_STATE = "QUOTE_ONLY"
SUBMITTED_STATE = "SUBMITTED_PENDING"
CONFIRMED_STATE = "DEST_CONFIRMED"
FAILED_STATE = "FAILED"

GetFn = Callable[[str], tuple[int, dict[str, Any]]]
PostFn = Callable[[str, dict[str, Any]], tuple[int, dict[str, Any]]]


def run_sim(
    *,
    quote_id: str,
    wallet: str | None = None,
    tx_hash: str | None = None,
    threshold: int = 12,
    interval: float = 2.0,
    max_wait: float = 3600.0,
    get: GetFn,
    post: PostFn,
    sleep: Callable[[float], None] | None = None,
    now: Callable[[], float] | None = None,
) -> int:
    """Execute the wallet-side flow; returns a process exit code."""
    if sleep is None:
        sleep = time.sleep
    if now is None:
        now = time.monotonic
    monitor_path = f"/swap/monitor/{quote_id}"

    status, first = get(monitor_path)
    if status == 404:
        print(f"quote {quote_id!r} not found", file=sys.stderr)
        return EXIT_NOT_FOUND
    if status != 200:
        print(f"monitor error {status}: {first}", file=sys.stderr)
        return EXIT_USAGE

    if first.get("state") == PENDING_STATE and tx_hash:
        if not wallet:
            print("a wallet address is required to confirm", file=sys.stderr)
            return EXIT_CONFIRM_REJECTED
        status, receipt = post(
            "/swap/handoff/confirm",
            {"quote_id": quote_id, "source_tx_hash": tx_hash, "wallet": wallet},
        )
        if status == 404:
            print(f"quote {quote_id!r} not found", file=sys.stderr)
            return EXIT_NOT_FOUND
        if status != 200:
            print(f"confirm rejected {status}: {receipt}", file=sys.stderr)
            return EXIT_CONFIRM_REJECTED
        print(f"confirmed {quote_id} -> {receipt.get('state')}")

    deadline = now() + max_wait
    while True:
        status, body = get(monitor_path)
        if status == 404:
            print(f"quote {quote_id!r} not found", file=sys.stderr)
            return EXIT_NOT_FOUND
        if status != 200:
            print(f"monitor error {status}: {body}", file=sys.stderr)
            return EXIT_USAGE
        state = body.get("state")
        if state == CONFIRMED_STATE:
            print(f"{quote_id} {CONFIRMED_STATE}")
            return EXIT_OK
        if state == FAILED_STATE:
            print(f"{quote_id} {FAILED_STATE}", file=sys.stderr)
            return EXIT_FAILED
        confirmations = body.get("confirmations")
        if isinstance(confirmations, int) and confirmations >= threshold:
            print(f"{quote_id} final ({confirmations} confirmations)")
            return EXIT_OK
        if now() >= deadline:
            print(f"{quote_id} timed out in state {state}", file=sys.stderr)
            return EXIT_TIMEOUT
        sleep(interval)


def _transport(base_url: str, api_prefix: str) -> tuple[GetFn, PostFn]:
    """Standard-library HTTP transport bound to one backend origin."""

    def _read(resp: Any) -> dict[str, Any]:
        try:
            return json.loads(resp.read().decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            return {"detail": "unreadable payload"}

    def get(path: str) -> tuple[int, dict[str, Any]]:
        req = urllib.request.Request(base_url + api_prefix + path, method="GET")
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return resp.status, _read(resp)
        except urllib.error.HTTPError as err:
            try:
                return err.code, json.loads(err.read().decode("utf-8"))
            except (ValueError, UnicodeDecodeError):
                return err.code, {"detail": "unreadable payload"}

    def post(path: str, body: dict[str, Any]) -> tuple[int, dict[str, Any]]:
        data = json.dumps(body).encode("utf-8")
        req = urllib.request.Request(
            base_url + api_prefix + path,
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return resp.status, _read(resp)
        except urllib.error.HTTPError as err:
            try:
                return err.code, json.loads(err.read().decode("utf-8"))
            except (ValueError, UnicodeDecodeError):
                return err.code, {"detail": "unreadable payload"}

    return get, post


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--api-prefix", default="/api/v1")
    parser.add_argument("--quote-id", required=True)
    parser.add_argument("--wallet", default=None)
    parser.add_argument("--hash", default=None)
    parser.add_argument("--confirmations", type=int, default=12)
    parser.add_argument("--interval", type=float, default=2.0)
    parser.add_argument("--max-wait", type=float, default=3600.0)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    get, post = _transport(args.base_url.rstrip("/"), args.api_prefix)
    try:
        return run_sim(
            quote_id=args.quote_id,
            wallet=args.wallet,
            tx_hash=args.hash,
            threshold=args.confirmations,
            interval=args.interval,
            max_wait=args.max_wait,
            get=get,
            post=post,
        )
    except (urllib.error.URLError, TimeoutError, OSError) as err:
        print(f"backend unreachable: {err}", file=sys.stderr)
        return EXIT_USAGE


if __name__ == "__main__":
    raise SystemExit(main())

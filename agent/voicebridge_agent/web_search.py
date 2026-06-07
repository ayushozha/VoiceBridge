"""Minimal async Exa ``/search`` client for the live incident agent.

The ``web_search`` engine calls this to ground answers in fresh web context
(e.g. a vendor's published status page during an incident). It is intentionally
dependency-light - ``aiohttp`` only, which the agent already depends on - and it
NEVER raises: web search is a best-effort augmentation, not a critical path, so
any failure degrades to an empty result list and the call keeps going.

Exa API shape (current as of 2026-06):
  POST https://api.exa.ai/search
  headers: {"x-api-key": <key>, "Content-Type": "application/json"}
  body:    {"query": str, "type": "auto", "numResults": int,
            "contents": {"highlights": true}}
  resp:    {"results": [{"title": str, "url": str, "highlights": [str, ...]}]}
"""

from __future__ import annotations

import logging

import aiohttp

__all__ = ["exa_search"]

logger = logging.getLogger("voicebridge.web_search")

_EXA_SEARCH_URL = "https://api.exa.ai/search"
_SNIPPET_MAX_CHARS = 240


async def exa_search(
    query: str,
    *,
    api_key: str | None,
    num_results: int = 6,
    timeout_s: float = 8.0,
) -> list[dict]:
    """Search the web via Exa and return ``[{"title","url","snippet"}, ...]``.

    Returns ``[]`` when no API key is configured or on any error. Never raises -
    the live call must survive provider failures.
    """
    if not api_key:
        return []

    headers = {"x-api-key": api_key, "Content-Type": "application/json"}
    body = {
        "query": query,
        "type": "auto",
        "numResults": num_results,
        "contents": {"highlights": True},
    }
    timeout = aiohttp.ClientTimeout(total=timeout_s)

    try:
        async with (
            aiohttp.ClientSession(timeout=timeout) as session,
            session.post(_EXA_SEARCH_URL, headers=headers, json=body) as resp,
        ):
            resp.raise_for_status()
            data = await resp.json()
    except Exception as exc:  # noqa: BLE001 - web search must never kill the call
        logger.warning("Exa search failed for %r: %s", query, exc)
        return []

    results: list[dict] = []
    for item in data.get("results") or []:
        highlights = item.get("highlights") or []
        snippet = " ".join(h.strip() for h in highlights if h).strip()
        if len(snippet) > _SNIPPET_MAX_CHARS:
            snippet = snippet[:_SNIPPET_MAX_CHARS].rstrip() + "..."
        results.append(
            {
                "title": item.get("title") or "",
                "url": item.get("url") or "",
                "snippet": snippet,
            }
        )
    return results

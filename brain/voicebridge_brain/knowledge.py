"""Document parsing and business knowledge retrieval for VoiceBridge Agent 8.

This module keeps the UnSiloed/MOSS integration seam usable without requiring
live sponsor credentials during the hackathon demo. The default document is a
pre-parsed UnSiloed-shaped fixture, normalized into MOSS-like business knowledge
records that the orchestrator can index or search directly.
"""

from __future__ import annotations

import json
import re
from collections.abc import Mapping
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal, TypedDict

DEMO_TENANT_ID = "northstar_insurance"
DEMO_USER_ID = "ayush_demo"
DEMO_CASE_ID = "home_claim_H-48291"
DEMO_CLAIM_NUMBER = "H-48291"

FIXTURE_DIR = Path(__file__).resolve().parent / "fixtures"
DEFAULT_FIXTURE = FIXTURE_DIR / "northstar_claim_H-48291_unsiloed.json"

KnowledgeSource = Literal["moss", "unsiloed", "local"]
DocumentInput = str | Path | Mapping[str, Any] | None
ScopeInput = Mapping[str, Any] | object | None


class KnowledgeScope(TypedDict):
    tenant_id: str
    user_id: str
    case_id: str


class DocumentSource(TypedDict, total=False):
    integration: str
    mode: str
    source_uri: str
    original_filename: str
    parsed_at: str


class KnowledgeChunk(TypedDict, total=False):
    chunk_id: str
    section: str
    topics: list[str]
    text: str
    page: int


class ParsedBusinessDocument(TypedDict, total=False):
    schema: str
    document_id: str
    title: str
    source: DocumentSource
    scope: KnowledgeScope
    business_context: dict[str, Any]
    structured_fields: dict[str, Any]
    chunks: list[KnowledgeChunk]


class MossKnowledgeRecord(TypedDict, total=False):
    id: str
    namespace: str
    scope: KnowledgeScope
    text: str
    metadata: dict[str, Any]
    provenance: dict[str, Any]


class KnowledgeSearchResponse(TypedDict, total=False):
    source: KnowledgeSource
    score: float
    matches: list[str]
    document: str
    results: list[MossKnowledgeRecord]
    scope: KnowledgeScope


@dataclass(frozen=True, slots=True)
class KnowledgeMatch:
    """Payload-compatible result for ``knowledge.retrieved`` events."""

    source: KnowledgeSource
    matches: list[str]
    document: str | None = None
    score: float | None = None
    results: list[MossKnowledgeRecord] = field(default_factory=list)
    scope: KnowledgeScope = field(
        default_factory=lambda: {
            "tenant_id": DEMO_TENANT_ID,
            "user_id": DEMO_USER_ID,
            "case_id": DEMO_CASE_ID,
        }
    )

    def to_event_payload(self) -> KnowledgeSearchResponse:
        """Return the shared contract payload fields for ``knowledge.retrieved``."""
        payload: KnowledgeSearchResponse = {
            "source": self.source,
            "matches": list(self.matches),
        }
        if self.document is not None:
            payload["document"] = self.document
        if self.score is not None:
            payload["score"] = self.score
        return payload


class BusinessKnowledgeAdapter:
    """Agent 8 adapter implementing the orchestrator's knowledge tool shape."""

    def search_business_knowledge(self, scope: ScopeInput, query: str) -> KnowledgeMatch:
        return search_business_knowledge(scope, query)


_TOKEN_RE = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)?")
_TOPIC_BOOSTS = {
    "upload": ("upload_instructions", "portal", "secure_link"),
    "portal": ("upload_instructions", "portal", "portal_help"),
    "link": ("secure_link",),
    "deadline": ("deadline", "review_delay"),
    "due": ("deadline",),
    "when": ("deadline",),
    "missing": ("missing_documents", "document_requirements"),
    "documents": ("missing_documents", "document_requirements", "upload_instructions"),
    "photos": ("missing_documents", "document_requirements"),
    "estimate": ("missing_documents", "document_requirements"),
    "escalate": ("escalation", "claims_advocate"),
    "help": ("escalation", "claims_advocate", "portal_help"),
}


def parse_business_document(source: DocumentInput = None) -> ParsedBusinessDocument:
    """Parse a business document into the UnSiloed-shaped VoiceBridge schema.

    Live UnSiloed ingestion can be plugged in later at this seam. Today this
    returns the local H-48291 fixture for demo identifiers, direct fixture paths,
    or already parsed mappings.
    """

    raw = _load_document_source(source)
    return _normalize_document(raw)


def build_business_knowledge_index(
    document: DocumentInput = None,
    scope: ScopeInput = None,
) -> list[MossKnowledgeRecord]:
    """Return MOSS-like business knowledge records for a parsed document."""

    parsed = parse_business_document(document)
    record_scope = _scope_to_dict(scope) if scope is not None else parsed["scope"]
    records: list[MossKnowledgeRecord] = []

    for chunk in parsed.get("chunks", []):
        chunk_id = chunk["chunk_id"]
        topics = list(chunk.get("topics", []))
        source = parsed.get("source", {})
        metadata = {
            "claim_number": parsed.get("business_context", {}).get("claim_number"),
            "document_id": parsed["document_id"],
            "document_title": parsed["title"],
            "section": chunk.get("section", ""),
            "topics": topics,
            "source_integration": source.get("integration", "unsiloed"),
            "source_mode": source.get("mode", "local_fixture"),
        }
        provenance = {
            "document": parsed["title"],
            "document_id": parsed["document_id"],
            "chunk_id": chunk_id,
            "page": chunk.get("page"),
            "source_uri": source.get("source_uri"),
            "original_filename": source.get("original_filename"),
            "parsed_at": source.get("parsed_at"),
            "parser": source.get("integration", "unsiloed"),
            "mode": source.get("mode", "local_fixture"),
        }
        record_id = (
            f"business_knowledge::{record_scope['tenant_id']}::"
            f"{record_scope['case_id']}::{chunk_id}"
        )
        records.append(
            {
                "id": record_id,
                "namespace": "business_knowledge",
                "scope": dict(record_scope),
                "text": chunk["text"],
                "metadata": metadata,
                "provenance": provenance,
            }
        )

    return records


def search_business_knowledge(
    scope: ScopeInput,
    query: str,
    *,
    limit: int = 3,
    document: DocumentInput = None,
) -> KnowledgeMatch:
    """Search scoped business knowledge records for the orchestrator tool.

    The response mirrors the contract's ``knowledge.retrieved`` payload
    (``source``, ``score``, ``matches``, ``document``) and also includes full
    MOSS-like records for backend callers that need provenance.
    """

    requested_scope = _scope_to_dict(scope)
    parsed = parse_business_document(document)

    if not _scope_matches(parsed["scope"], requested_scope):
        return KnowledgeMatch(
            source="local",
            score=0.0,
            matches=[],
            document=parsed["title"],
            results=[],
            scope=requested_scope,
        )

    records = build_business_knowledge_index(parsed, requested_scope)
    scored = [
        (_score_record(record, query), record)
        for record in records
        if query.strip()
    ]
    ranked = sorted(
        ((score, record) for score, record in scored if score > 0),
        key=lambda item: (-item[0], item[1]["id"]),
    )[: max(limit, 0)]

    results = [record for _, record in ranked]
    return KnowledgeMatch(
        source="local",
        score=round(ranked[0][0], 3) if ranked else 0.0,
        matches=[record["text"] for record in results],
        document=parsed["title"],
        results=results,
        scope=requested_scope,
    )


def _load_document_source(source: DocumentInput) -> Mapping[str, Any]:
    if source is None:
        return _read_json(DEFAULT_FIXTURE)

    if isinstance(source, Mapping):
        return source

    source_text = str(source)
    if "H-48291" in source_text or "h-48291" in source_text.lower():
        return _read_json(DEFAULT_FIXTURE)

    path = Path(source)
    candidates = (path, FIXTURE_DIR / source_text)
    for candidate in candidates:
        if candidate.exists():
            if candidate.suffix.lower() != ".json":
                raise ValueError(f"Only pre-parsed JSON fixtures are supported: {candidate}")
            return _read_json(candidate)

    raise FileNotFoundError(f"No business document fixture found for source: {source_text}")


def _read_json(path: Path) -> Mapping[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _normalize_document(raw: Mapping[str, Any]) -> ParsedBusinessDocument:
    required = ("document_id", "title", "source", "scope", "business_context", "chunks")
    missing = [key for key in required if key not in raw]
    if missing:
        raise ValueError(f"Parsed business document missing fields: {', '.join(missing)}")

    chunks = raw["chunks"]
    if not isinstance(chunks, list) or not chunks:
        raise ValueError("Parsed business document must include at least one chunk")

    normalized_chunks: list[KnowledgeChunk] = []
    for index, chunk in enumerate(chunks, start=1):
        if not isinstance(chunk, Mapping) or not chunk.get("text"):
            raise ValueError(f"Parsed business document chunk {index} is missing text")
        chunk_id = str(chunk.get("chunk_id") or f"{raw['document_id']}-chunk-{index}")
        topics = [str(topic) for topic in chunk.get("topics", [])]
        normalized_chunks.append(
            {
                "chunk_id": chunk_id,
                "section": str(chunk.get("section", "")),
                "topics": topics,
                "text": str(chunk["text"]),
                "page": int(chunk.get("page", 1)),
            }
        )

    return {
        "schema": str(raw.get("schema", "voicebridge.unsiloed.business_document.v1")),
        "document_id": str(raw["document_id"]),
        "title": str(raw["title"]),
        "source": dict(raw["source"]),
        "scope": _scope_to_dict(raw["scope"]),
        "business_context": dict(raw["business_context"]),
        "structured_fields": dict(raw.get("structured_fields", {})),
        "chunks": normalized_chunks,
    }


def _scope_to_dict(scope: ScopeInput) -> KnowledgeScope:
    if scope is None:
        return {
            "tenant_id": DEMO_TENANT_ID,
            "user_id": DEMO_USER_ID,
            "case_id": DEMO_CASE_ID,
        }

    if isinstance(scope, Mapping):
        getter = scope.get
    else:
        def getter(key: str, default: str | None = None) -> Any:
            return getattr(scope, key, default)

    return {
        "tenant_id": str(getter("tenant_id", DEMO_TENANT_ID)),
        "user_id": str(getter("user_id", DEMO_USER_ID)),
        "case_id": str(getter("case_id", DEMO_CASE_ID)),
    }


def _scope_matches(document_scope: KnowledgeScope, requested_scope: KnowledgeScope) -> bool:
    return (
        document_scope["tenant_id"] == requested_scope["tenant_id"]
        and document_scope["user_id"] == requested_scope["user_id"]
        and document_scope["case_id"] == requested_scope["case_id"]
    )


def _score_record(record: MossKnowledgeRecord, query: str) -> float:
    query_tokens = _tokens(query)
    if not query_tokens:
        return 0.0

    metadata = record.get("metadata", {})
    topics = [str(topic) for topic in metadata.get("topics", [])]
    haystack = " ".join(
        [
            record.get("text", ""),
            str(metadata.get("section", "")),
            " ".join(topics),
            str(metadata.get("claim_number", "")),
        ]
    )
    haystack_tokens = _tokens(haystack)
    overlap = len(query_tokens & haystack_tokens)
    score = overlap / len(query_tokens)

    topic_set = set(topics)
    for token in query_tokens:
        if topic_set.intersection(_TOPIC_BOOSTS.get(token, ())):
            score += 0.35

    claim_number = str(metadata.get("claim_number", "")).lower()
    if claim_number and claim_number in query.lower():
        score += 0.25

    return score


def _tokens(value: str) -> set[str]:
    return set(_TOKEN_RE.findall(value.lower().replace("_", " ")))


__all__ = [
    "DEMO_CASE_ID",
    "DEMO_CLAIM_NUMBER",
    "DEMO_TENANT_ID",
    "DEMO_USER_ID",
    "KnowledgeScope",
    "KnowledgeMatch",
    "KnowledgeSearchResponse",
    "MossKnowledgeRecord",
    "ParsedBusinessDocument",
    "BusinessKnowledgeAdapter",
    "build_business_knowledge_index",
    "parse_business_document",
    "search_business_knowledge",
]

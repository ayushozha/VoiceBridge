from __future__ import annotations

from dataclasses import dataclass

from voicebridge_brain.knowledge import (
    DEMO_CASE_ID,
    DEMO_TENANT_ID,
    DEMO_USER_ID,
    BusinessKnowledgeAdapter,
    build_business_knowledge_index,
    parse_business_document,
    search_business_knowledge,
)


@dataclass(frozen=True)
class ContractLikeScope:
    tenant_id: str = DEMO_TENANT_ID
    user_id: str = DEMO_USER_ID
    case_id: str = DEMO_CASE_ID


def test_parse_business_document_returns_unsiloed_shaped_fixture() -> None:
    document = parse_business_document("claim H-48291")

    assert document["source"]["integration"] == "unsiloed"
    assert document["source"]["mode"] == "local_fixture"
    assert document["business_context"]["claim_number"] == "H-48291"
    assert document["business_context"]["claim_status"] == "pending_documents_needed"
    assert document["structured_fields"]["missing_documents"] == [
        "damage photos",
        "licensed contractor repair estimate",
    ]
    assert len(document["chunks"]) >= 4


def test_business_knowledge_index_is_moss_shaped_with_provenance() -> None:
    records = build_business_knowledge_index(scope=ContractLikeScope())

    assert records
    first = records[0]
    assert first["namespace"] == "business_knowledge"
    assert first["scope"] == {
        "tenant_id": DEMO_TENANT_ID,
        "user_id": DEMO_USER_ID,
        "case_id": DEMO_CASE_ID,
    }
    assert first["metadata"]["document_id"] == "unsiloed-northstar-claim-H-48291-request-v1"
    assert first["metadata"]["source_integration"] == "unsiloed"
    assert first["metadata"]["source_mode"] == "local_fixture"
    assert first["provenance"]["parser"] == "unsiloed"
    assert first["provenance"]["mode"] == "local_fixture"


def test_search_business_knowledge_retrieves_upload_and_deadline_context() -> None:
    result = search_business_knowledge(
        ContractLikeScope(),
        "Where do I upload documents and what is the deadline for claim H-48291?",
        limit=3,
    )

    assert result.source == "local"
    assert result.document == "Northstar Insurance claim H-48291 document request"
    assert result.score is not None and result.score > 0
    assert any("claims portal" in match for match in result.matches)
    assert any("June 17, 2026" in match for match in result.matches)
    assert all(record["provenance"]["document_id"] for record in result.results)

    payload = result.to_event_payload()
    assert payload["source"] == "local"
    assert payload["matches"] == result.matches
    assert payload["document"] == result.document


def test_business_knowledge_adapter_matches_orchestrator_tool_shape() -> None:
    adapter = BusinessKnowledgeAdapter()
    result = adapter.search_business_knowledge(ContractLikeScope(), "missing photos")

    assert result.source == "local"
    assert result.matches
    assert result.document is not None


def test_search_business_knowledge_is_scope_isolated() -> None:
    result = search_business_knowledge(
        {"tenant_id": DEMO_TENANT_ID, "user_id": "different_user", "case_id": DEMO_CASE_ID},
        "upload deadline",
    )

    assert result.score == 0.0
    assert result.matches == []
    assert result.results == []

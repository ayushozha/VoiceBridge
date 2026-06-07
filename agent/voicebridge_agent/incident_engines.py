"""Live incident "engines" the in-room agent fires from conversation.

Each engine publishes one or more VoiceBridge contract events over the LiveKit
data channel so the orb HUD renders the corresponding scene/panel the moment the
operator speaks. This is the live counterpart to
``voicebridge_brain.commandos.CommandOSOrchestrator`` (which emits the whole
scripted stream at once): the *payloads* are shared with the brain so the live
and scripted paths are byte-for-byte identical, but here each engine is fired
independently by an LLM tool call.

Design notes:
  - Payload shapes are imported from the brain so there is one source of truth.
  - Engines are free-flow: the LLM may call them in any order, any number of
    times. Each engine is idempotent — re-firing it just re-emits its events.
  - Every engine returns a short, plain-English string the agent can speak.
"""

from __future__ import annotations

import asyncio
import logging
from typing import TYPE_CHECKING, Any

from voicebridge_brain.commandos import (
    SelfImprovingIncidentMemory,
    _approval_payload,
    _dashboard_payload,
    _failure_payload,
    _map_payload,
    _mitigation_payload,
    _report_payload,
    _runbook_payload,
    _scene,
    _topology_payload,
)
from voicebridge_brain.guardrails import check_dangerous_action
from voicebridge_contract import COMMANDOS_INCIDENT_TITLE, Event, MemoryScope, make_event

from voicebridge_agent.events import publish_existing_event
from voicebridge_agent.web_search import exa_search

if TYPE_CHECKING:  # avoid importing the heavy SDK at module load
    from livekit import rtc

logger = logging.getLogger("voicebridge.engines")


class IncidentEngines:
    """Stateful, conversation-driven emitter for the CommandOS incident HUD.

    One instance is created per call. It owns the running ``sequence`` counter
    and the incident memory backend so repeated tool calls stay coherent.
    """

    def __init__(
        self,
        room: rtc.Room,
        scope: MemoryScope,
        memory: Any | None = None,
        *,
        exa_api_key: str | None = None,
    ) -> None:
        self._room = room
        self._scope = scope
        self._sequence = 0
        self._memory = memory or SelfImprovingIncidentMemory()
        self._exa_api_key = exa_api_key
        # Track what has been built so dashboard/report reflect real progress.
        self._fired: set[str] = set()
        self._last_similar: dict[str, Any] | None = None
        # True once a *configured* MOSS backend has errored and we fell back to
        # local memory — lets the trace distinguish "MOSS errored" (unavailable)
        # from "no MOSS configured" (stub).
        self._moss_degraded = False

    async def _emit(
        self,
        type: str,
        payload: dict[str, Any],
        *,
        turn_id: str,
        mode: str = "stub",
        correlation_id: str | None = None,
    ) -> Event:
        """Build a sequenced contract event and publish it to the room."""
        self._sequence += 1
        event = make_event(
            type,  # type: ignore[arg-type]
            payload,
            self._scope,
            event_id=f"{self._scope.case_id}:{self._sequence:03d}:{type}",
            sequence=self._sequence,
            turn_id=turn_id,
            correlation_id=correlation_id or turn_id,
            mode=mode,  # type: ignore[arg-type]
        )
        await publish_existing_event(self._room, event)
        self._fired.add(type)
        logger.info("engine emitted %s (seq=%s)", type, self._sequence)
        return event

    async def bootstrap_memory(self) -> str:
        """Load prior incident memory without opening the HUD before user intent."""
        similar = await self._recall_similar(
            "preload prior Texas payment gateway incident memory",
        )
        self._last_similar = similar
        mode = self._recall_mode(similar)
        await self._emit(
            "memory.recalled",
            self._memory_recall_payload(similar, mode),
            turn_id="memory_bootstrap",
            mode=mode,
        )
        return "Incident memory loaded."

    async def _recall_similar(self, query: str) -> dict[str, Any]:
        """Recall from MOSS when available, with local fallback on provider errors."""
        try:
            return await asyncio.to_thread(
                self._memory.recall_similar_incident,
                query,
                "Texas",
                "payment_gateway",
            )
        except Exception as exc:  # noqa: BLE001 - fallback keeps the live call alive
            if getattr(self._memory, "source", None) != "moss":
                raise
            logger.warning("MOSS recall failed; falling back to local memory: %s", exc)
            self._moss_degraded = True
            self._memory = SelfImprovingIncidentMemory()
            return await asyncio.to_thread(
                self._memory.recall_similar_incident,
                query,
                "Texas",
                "payment_gateway",
            )

    async def _remember_incident_learning(self, report: dict[str, Any]) -> dict[str, Any]:
        """Write final incident learning through MOSS, falling back locally if needed."""
        try:
            return await asyncio.to_thread(
                self._memory.remember_incident_learning,
                self._scope,
                report,
            )
        except Exception as exc:  # noqa: BLE001 - writeback must not kill the call
            if getattr(self._memory, "source", None) != "moss":
                raise
            logger.warning("MOSS write failed; falling back to local memory: %s", exc)
            self._moss_degraded = True
            self._memory = SelfImprovingIncidentMemory()
            return await asyncio.to_thread(
                self._memory.remember_incident_learning,
                self._scope,
                report,
            )

    def _recall_mode(self, similar: dict[str, Any]) -> str:
        """Honest integration mode for a memory recall.

        ``unavailable`` when a configured MOSS backend errored (so the trace
        shows MOSS *failed*, not merely absent), ``live`` on a real MOSS hit,
        else ``stub`` when MOSS was never configured.
        """
        if self._moss_degraded:
            return "unavailable"
        return "live" if similar["source"] == "moss" else "stub"

    def _memory_recall_payload(self, similar: dict[str, Any], mode: str) -> dict[str, Any]:
        return {
            "source": similar["source"],
            "score": similar["similarity"],
            "summary": [
                "Similar Texas gateway saturation detected.",
                "Early restart previously increased duplicate-charge risk.",
                "Traffic shift before controlled restart was the successful path.",
            ],
            "prior_call": similar,
            "provider": "moss",
            "integration_mode": mode,
        }

    # ── Lifecycle ──────────────────────────────────────────────────────────

    async def start_incident(self, operator_prompt: str) -> str:
        """Open the incident workspace (orb is already live/listening)."""
        await self._emit(
            "incident.started",
            {
                "incident_id": self._scope.case_id,
                "title": COMMANDOS_INCIDENT_TITLE,
                "severity": "SEV-1",
                "status": "investigating",
                "operator_prompt": operator_prompt,
                "provider": "commandos",
                "integration_mode": "stub",
            },
            turn_id="opening",
        )
        return "Incident workspace is open."

    async def set_scene(self, state: str, visual: str, caption: str) -> str:
        """Move the HUD camera/scene without firing a data engine."""
        await self._emit("scene.state", _scene(state, visual, caption), turn_id="scene")
        return f"Scene set to {visual}."

    # ── Generative HUD (free-form panels the LLM composes live) ───────────────

    async def render_panel(
        self,
        id: str,
        component: str,
        title: str = "",
        items: list[dict[str, Any]] | None = None,
        subtitle: str = "",
        scene_hint: str = "",
        source: str = "computed",
    ) -> str:
        """Render a generative HUD panel (hud.component, op=render)."""
        payload: dict[str, Any] = {
            "id": id,
            "op": "render",
            "component": component,
            "title": title,
            "subtitle": subtitle,
            "items": list(items or []),
            "source": source,
        }
        if scene_hint:
            payload["scene_hint"] = scene_hint
            await self._emit(
                "scene.state",
                _scene("building", scene_hint, title or f"Rendering {component}"),
                turn_id="hud",
            )
        await self._emit("hud.component", payload, turn_id="hud", mode="live")
        return f"Rendered {component} panel '{title}'."

    async def update_panel(
        self,
        id: str,
        title: str | None = None,
        subtitle: str | None = None,
        items: list[dict[str, Any]] | None = None,
        scene_hint: str | None = None,
        source: str | None = None,
    ) -> str:
        """Patch an existing HUD panel in place (hud.component, op=patch)."""
        payload: dict[str, Any] = {"id": id, "op": "patch", "component": "callout"}
        if title is not None:
            payload["title"] = title
        if subtitle is not None:
            payload["subtitle"] = subtitle
        if items is not None:
            payload["items"] = list(items)
        if source is not None:
            payload["source"] = source
        if scene_hint is not None:
            payload["scene_hint"] = scene_hint
            await self._emit(
                "scene.state",
                _scene("building", scene_hint, title or f"Updating {id}"),
                turn_id="hud",
            )
        await self._emit("hud.component", payload, turn_id="hud", mode="live")
        return f"Updated panel {id}."

    async def remove_panel(self, id: str) -> str:
        """Remove a HUD panel (hud.component, op=remove)."""
        await self._emit(
            "hud.component",
            {"id": id, "op": "remove", "component": "callout"},
            turn_id="hud",
            mode="live",
        )
        return f"Removed panel {id}."

    async def focus_section(self, target: str) -> str:
        """Animate the HUD camera to the scene that best matches an intent word."""
        visuals = {
            "why": "payment_topology",
            "where": "failure_map",
            "trend": "failure_map_drilldown",
            "compare": "payment_topology",
            "overview": "dashboard",
            "memory": "prior_incident_overlay",
            "plan": "mitigation_morph",
        }
        visual = visuals.get(target, "dashboard")
        await self._emit(
            "scene.state",
            _scene("speaking", visual, f"Focusing on {target}"),
            turn_id="hud",
        )
        return f"Focused on {target}."

    async def web_search(self, query: str) -> str:
        """Search the web via Exa to ground the answer (web.search.results)."""
        api_key = self._exa_api_key
        if api_key is None:
            # Lazy fallback so search works even before the orchestrator wires it.
            from voicebridge_agent.config import load_config

            api_key = load_config().exa_api_key
        results = await exa_search(query, api_key=api_key)
        mode = "live" if (api_key and results) else "unavailable"
        await self._emit(
            "web.search.results",
            {"query": query, "results": results},
            turn_id="web_search",
            mode=mode,
        )
        if not results:
            return "I couldn't reach web search right now."
        titles = [r["title"] for r in results[:2] if r.get("title")]
        if not titles:
            return "I found some results, but none had a clear title."
        if len(titles) == 1:
            return f"Top web result: {titles[0]}."
        return f"Top web results: {titles[0]}; and {titles[1]}."

    # ── Engines (one per HUD module) ─────────────────────────────────────────

    async def inspect_payment_failures(self) -> str:
        """Build the regional failure map (map.hotspots)."""
        await self._emit(
            "scene.state",
            _scene("building", "failure_map", "Building Texas payment failure map"),
            turn_id="map",
        )
        await self._emit("map.hotspots", _map_payload(), turn_id="map")
        return (
            "Regional spike found. Texas premium customers are failing at 18.4 percent "
            "versus a 2.1 percent baseline."
        )

    async def drilldown_cities(self) -> str:
        """Drill the map into the per-city breakdown."""
        await self._emit(
            "scene.state",
            _scene("building", "failure_map_drilldown", "Drilling into city breakdown"),
            turn_id="drilldown",
        )
        return "Dallas has the highest volume. Austin has the steepest spike."

    async def build_spatial_failure_model(self) -> str:
        """Build the payment topology and localize the failure (topology + failure)."""
        await self._emit(
            "scene.state",
            _scene("building", "payment_topology", "Building payment flow topology"),
            turn_id="topology",
        )
        await self._emit("topology.built", _topology_payload(), turn_id="topology")
        await self._emit("failure.localized", _failure_payload(), turn_id="topology")
        return (
            "Failures pass checkout validation and gateway authorization, then stall "
            "before processor confirmation. This points to gateway queue saturation, "
            "not card declines."
        )

    async def recall_similar_incidents(self) -> str:
        """Recall the prior matching incident from memory (memory + similar)."""
        similar = await self._recall_similar(
            "why are payments failing have we seen this before",
        )
        self._last_similar = similar
        mode = self._recall_mode(similar)
        data_mode = "live" if similar["source"] == "moss" else "stub"
        await self._emit(
            "scene.state",
            _scene("speaking", "prior_incident_overlay", "Prior incident pattern overlay"),
            turn_id="memory",
        )
        await self._emit(
            "memory.recalled",
            self._memory_recall_payload(similar, mode),
            turn_id="memory",
            mode=mode,
        )
        await self._emit("similar_incident.recalled", similar, turn_id="memory", mode=data_mode)
        return (
            "Yes. A similar Texas spike hit about a month ago. The team restarted too "
            "early, queue depth was still high, and duplicate-charge risk rose."
        )

    async def retrieve_runbook_policy(self) -> str:
        """Retrieve the runbook/policy guidance (knowledge.retrieved)."""
        await self._emit("knowledge.retrieved", _runbook_payload(), turn_id="mitigation")
        return (
            "The runbook says: do not restart the gateway before checking queue depth, "
            "and shift traffic before any restart."
        )

    async def propose_mitigation(self) -> str:
        """Propose and render the mitigation path (mitigation.proposed)."""
        if "knowledge.retrieved" not in self._fired:
            await self._emit("knowledge.retrieved", _runbook_payload(), turn_id="mitigation")
        await self._emit(
            "scene.state",
            _scene("building", "mitigation_morph", "Rerouting Texas traffic"),
            turn_id="mitigation",
        )
        await self._emit("mitigation.proposed", _mitigation_payload(), turn_id="mitigation")
        return (
            "My recommendation: check queue depth, shift Texas traffic to a secondary "
            "gateway through a load balancer, then a controlled restart after approval."
        )

    async def check_action_guardrail(self, action: str = "restart_payment_gateway") -> str:
        """Check a risky action against the guardrail (guardrail.checked)."""
        decision = check_dangerous_action(
            self._scope,
            action,
            checks={"queue_depth_checked": False},
            approval_confirmed=False,
        )
        payload = decision.to_event_payload()
        payload.update(
            {
                "risk": ["duplicate charges", "retry storm", "processor replay mismatch"],
                "required_checks": ["gateway_queue_depth", "duplicate_charge_risk"],
                "prior_incident_warning": True,
                "provider": "truefoundry",
                "integration_mode": "stub",
            }
        )
        await self._emit(
            "guardrail.checked",
            payload,
            turn_id="guardrail",
            correlation_id=action,
        )
        return (
            "I can't recommend that yet. Queue depth is unknown, and this exact sequence "
            "caused duplicate-charge risk last time. I can run the queue-depth check or "
            "prepare an approval request."
        )

    async def prepare_approval_request(self) -> str:
        """Prepare the human-approval request card (approval.requested)."""
        await self._emit("approval.requested", _approval_payload(), turn_id="approval")
        return (
            "Approval request prepared for a controlled gateway restart after the "
            "queue-depth check, with the prior-incident warning attached."
        )

    async def generate_incident_dashboard(self) -> str:
        """Fold the live event log into a dashboard + report (dashboard + report)."""
        await self._emit(
            "scene.state",
            _scene("building", "dashboard", "Assembling incident workspace"),
            turn_id="dashboard",
        )
        await self._emit(
            "dashboard.generated",
            _dashboard_payload(self._sequence + 1),
            turn_id="dashboard",
        )
        report = _report_payload()
        await self._emit("report.created", report, turn_id="dashboard")
        await self._emit(
            "memory.written",
            await self._remember_incident_learning(report),
            turn_id="dashboard",
        )
        await self._emit(
            "outcome.created",
            {
                "incident_status": "mitigation_ready",
                "root_cause_hypothesis": report["root_cause_hypothesis"],
                "blocked_actions": ["restart_payment_gateway"],
                "approvals": ["controlled restart approval prepared"],
                "customer_update": report["customer_update"],
                "follow_up": "Add regional load balancing follow-up ticket.",
            },
            turn_id="dashboard",
        )
        await self._emit(
            "audit.saved",
            {
                "store": "local",
                "record_id": "audit_sev1_tx_payments_001",
                "event": "report.created",
                "provider": "aws",
                "integration_mode": "stub",
            },
            turn_id="dashboard",
        )
        return (
            "Incident workspace assembled: failure map, root cause, mitigation, "
            "approval, and a customer-update draft."
        )

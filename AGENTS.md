# CommandOS Backend Handoff

## Product Direction

CommandOS is a voice operating system for interactive incident dashboards. The
backend should make the frontend feel like an OS, not a static dashboard:

- voice in
- conversation state
- spatial incident model
- prior-incident memory
- guarded action path
- generated dashboard/report

Do not broaden the demo into generic incident management. The hackathon wedge is
the conversational voice OS that turns boring dashboards into interactive 3D
operating surfaces.

## Current Backend Contract

The backend emits JSON events using the shared envelope from
`contracts/events.json`, `contracts/python/voicebridge_contract/__init__.py`,
and `contracts/ts/src/index.ts`.

Required envelope fields:

- `type`
- `tenant_id`
- `user_id`
- `case_id`
- `timestamp`
- `event_id`
- `sequence`
- `turn_id`
- `correlation_id`
- `mode`
- `payload`

Current LiveKit topic:

- `voicebridge.events`

CommandOS alias for future surfaces:

- `commandos.events`

The frontend can consume either the existing LiveKit data-channel topic or the
NDJSON export from `voicebridge_brain.commandos.commandos_demo_ndjson()` during
local standalone work.

## Backend Components Passed To Frontend

The frontend should render from these event components only. Do not hardcode the
demo flow in UI state.

### Voice And Orb State

- `call.started`: room/session started.
- `call.agent_joined`: backend agent joined.
- `call.audio_ready`: voice path ready.
- `scene.state`: orb and scene state, such as `idle`, `listening`, `thinking`,
  `building`, and `speaking`.
- `voice.spoken`: spoken CommandOS status, provider, language, and latency.

### Conversation

- `user.intent`: operator utterance.
- `user.choice`: operator selection or answer to a follow-up question.
- `agent.utterance`: CommandOS response.
- `query.scoped`: resolved time window, customer segment, and scope chips.

### 3D Incident Model

- `incident.started`: incident id, title, severity, status, and initial prompt.
- `map.hotspots`: region, baseline/current failure rates, city lat/lng points,
  severity, transaction volume, and map animation hints.
- `topology.built`: payment-flow nodes and edges.
- `failure.localized`: suspected failure point, hypothesis, confidence,
  excluded causes, and evidence.

### Memory And Self-Improving RAG

- `memory.recalled`: MOSS prior-incident summary.
- `similar_incident.recalled`: similarity score, prior failure, bad action,
  successful mitigation, owner, provenance, and ghost overlay hint.
- `memory.written`: final incident learning saved back to the memory harness.

The live demo must not call the local MOSS-shaped store a working sponsor
integration. `pnpm agent:live-check:strict` must pass before the judge demo.
MOSS uses the official Python SDK with `MOSS_PROJECT_ID`, `MOSS_PROJECT_KEY`,
`MOSS_MEMORY_INDEX_NAME`, and optional `MOSS_MODEL_ID`.

Redis is not required yet. Add Redis, Upstash Vector, RedisVL, LanceDB, or
sqlite-vec only when persistent vector recall across backend processes is
required and MOSS is not the chosen memory path.

### Docs And Runbook Retrieval

- `knowledge.retrieved`: UnSiloed runbook matches, score, source document,
  provider, and integration mode.

The live demo must parse a real document through UnSiloed, not only read the
fixture in `brain/voicebridge_brain/fixtures/`.

### Guardrails And Approvals

- `guardrail.checked`: risky-action decision. The restart moment must block
  until queue depth and human approval are present.
- `approval.requested`: action, status, risk, required checks, approver, and
  prior-incident warning.

### Dashboard And Report

- `mitigation.proposed`: mitigation sequence and architecture changes for the
  proposed 3D morph.
- `dashboard.generated`: dashboard sections and 3D-to-dashboard transition.
- `report.created`: root-cause hypothesis, mitigation, customer update, and
  postmortem skeleton.
- `outcome.created`: final incident outcome.
- `audit.saved`: audit/event-store record.

## Package Research Decisions

### Backend

Use what is already installed:

- LiveKit Agents for low-latency voice/session runtime.
- LiveKit data packets for backend-to-frontend state.
- Python dataclasses and local adapters for the deterministic incident harness.
- Existing MiniMax/ElevenLabs voice adapter path.
- Existing shared TS/Python contracts.

Do not add these yet:

- Redis or Upstash: not needed until persistent shared memory/vector recall is
  required.
- LangChain or LlamaIndex: too large for the core demo loop.
- FastAPI/SSE: useful later for a non-LiveKit replay API, but not required for
  the hackathon backend because LiveKit data packets already stream events.
- Celery/Temporal/Kubernetes: unnecessary for a single demo harness.

### Future 3D Frontend

Approved research direction for a separate frontend builder:

- `three`: already installed; keep it.
- `@react-three/fiber`: best React 19 fit for composing the 3D OS surface.
- `@react-three/drei`: cameras, text, controls, loaders, helpers.
- `@react-three/postprocessing`: bloom/glow/orb polish.
- `3d-force-graph`: fast topology/network visualization if custom Three.js
  graph work takes too long.
- `react-globe.gl`: quick globe/city arcs if a globe view beats the stylized
  Texas scene.
- `deck.gl` + `MapLibre`: only if real geospatial layers become necessary.

Avoid for this hackathon frontend:

- Cesium: too heavy for the stylized incident scene.
- Babylon/Unity/Unreal/raw WebGPU: unnecessary rewrite risk.
- A full GIS stack before the stylized OS visual is working.

## Validation Commands

Backend:

```powershell
pnpm brain:test
pnpm brain:lint
cd agent; uv run pytest
cd agent; uv run ruff check .
pnpm agent:smoke
pnpm agent:live-check
pnpm agent:live-check:strict
```

Contracts:

```powershell
pnpm --filter @voicebridge/contracts build
```

Root:

```powershell
pnpm typecheck
```

## Implementation Rules

- Backend changes must preserve a frontend-connectable event stream.
- Every generated event should include replay metadata: `event_id`, `sequence`,
  `turn_id`, and `correlation_id`.
- Every sponsor-facing event must be backed by a real provider call for the live
  demo. `stub` and `local` modes are allowed only for offline unit tests and
  must fail strict readiness.
- The 3D incident map requires `COMMANDOS_PAYMENTS_API_URL` returning real
  recent failure telemetry as JSON with a non-empty `hotspots` or `failures`
  array. Without that endpoint, the map is a replay and the demo is blocked.
- Do not claim infrastructure actions were executed unless a real adapter did
  it.
- Do not build frontend UI in backend tasks.

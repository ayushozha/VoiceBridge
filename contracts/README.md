# VoiceBridge Shared Contract

This is the **seam** between the two halves of VoiceBridge:

- **Surface** (Next.js web + Python voice transport): Agents 1 (call infra), 2 (voice),
  6 (user console), 7 (insurer portal + runtime trace).
- **Brain** (decides what to say): Agents 3 (orchestrator), 4 (MOSS memory),
  5 (consent/guardrails), 8 (UnSiloed docs), 9 (Qwen multilingual).

Both halves import these types so they agree on:

1. **The event protocol** — JSON events flowing over the LiveKit data channel
   (`call.started` … `outcome.created`). See `tasks.md` § Event Contract.
2. **The agent-tool surface** — the 8 tools the voice agent exposes
   (`search_business_knowledge` … `speak_response`). See `spec.md` § Agent Tools.
3. **Demo identifiers** — the canonical tenant / user / case ids.

## Layout

```
contracts/
  events.json        # single source of truth: event types + tool names + demo ids
  ts/                # TypeScript mirror (consumed by web/)
    src/index.ts
    package.json
    tsconfig.json
  python/            # Python mirror (consumed by agent/)
    voicebridge_contract/__init__.py
```

## Rule

`events.json` is canonical. The TS and Python files are hand-mirrored from it and from
the spec. If you add an event type or tool, add it in **all three** places. The set is
small on purpose — keep it that way so the brain and surface never drift.

## Transport

Events travel as UTF-8 JSON over LiveKit `room.localParticipant.publishData` /
the `RoomEvent.DataReceived` channel, topic `voicebridge.events`. Every event carries
`{ type, tenant_id, user_id, case_id, timestamp, payload }`. The `timestamp` is
ISO-8601 UTC. `payload` shape depends on `type` (see the typed payloads).

# VoiceBridge Parallel Build Tasks

Status: Draft
Date: 2026-06-07
Goal: make the voice call work first.

## Non-Negotiable P0

The first feature is a working low-latency voice call.

Nothing else matters until this is true:

1. A user can start a call from the browser.
2. The VoiceBridge agent joins the LiveKit room.
3. Audio flows both directions.
4. The agent hears the user or controlled insurer participant.
5. The agent responds in a natural voice with acceptable latency.
6. The call remains stable for the full 90-second demo path.
7. The team has a fallback path if real outbound SIP is blocked.

Acceptance target:

- Browser-to-agent LiveKit call works locally.
- Controlled insurer participant can be simulated.
- First response starts within roughly 1.5 seconds after user turn end when using the fastest available voice path.
- No hard dependency on a real insurer, real claim system, or real outbound phone call for the hackathon demo.

## Build Strategy

Use progressive call realism:

1. Browser-to-agent LiveKit call.
2. Browser-to-agent plus controlled insurer simulator in the same app.
3. LiveKit SIP outbound call only after the browser call is stable and SIP trunk credentials exist.

This avoids betting the whole demo on SIP setup. The product should still support real calls, but the hackathon proof must work deterministically.

## APIs And Credentials Needed

Already present in `.env`:

- LiveKit URL/API credentials.
- MOSS project credentials.
- UnSiloed API key.
- MiniMax API key.
- ElevenLabs API key and voice ID.
- Alibaba Cloud access key pair.
- VoiceBridge demo tenant/user/case IDs.

Still needed for full production-like path:

- `LIVEKIT_SIP_OUTBOUND_TRUNK_ID`: required for real outbound phone calls through LiveKit SIP.
- `DEMO_OUTBOUND_PHONE_NUMBER`: required if we place a real outbound call.
- `TRUEFOUNDRY_API_KEY`: required for live TrueFoundry gateway use.
- `TRUEFOUNDRY_GATEWAY_BASE_URL`: required for live TrueFoundry gateway use.
- `TRUEFOUNDRY_GUARDRAIL_CONFIG_ID`: required for configured policy guardrails.
- `DASHSCOPE_API_KEY`: likely required for Alibaba Model Studio / Qwen OpenAI-compatible API unless the Alibaba access key pair is converted to a DashScope API key in the console.
- `MINIMAX_GROUP_ID`: may be required depending on MiniMax account/API endpoint.
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET`: required only for deployed hosting/audit artifacts, not local demo.

APIs to use:

- LiveKit Agents and LiveKit rooms for the live call.
- LiveKit SIP `CreateSIPParticipant` only after outbound trunk setup exists.
- MOSS SDK/API for business knowledge retrieval and communication memory.
- UnSiloed parse API for claim/policy document parsing.
- TrueFoundry AI Gateway for model routing and guardrail checks.
- MiniMax TTS for sponsor voice path if integration is available.
- ElevenLabs TTS as a working low-latency fallback using the provided voice ID.
- Qwen via Alibaba Model Studio / DashScope for multilingual reasoning and language switching.
- AWS for deployment/audit persistence if time permits.

## Shared Demo Contract

Demo organization:

```text
Northstar Insurance
```

Demo user:

```text
Ayush
```

Demo case:

```text
home_claim_H-48291
```

Demo flow:

1. User starts call about claim H-48291.
2. Agent recalls prior claim context.
3. Insurer asks whether this is the same claim.
4. User confirms.
5. Insurer asks for claim number.
6. VoiceBridge pauses for consent.
7. User approves.
8. VoiceBridge shares claim number.
9. Insurer says photos and repair estimate are missing.
10. User asks for upload link/deadline.
11. User switches to Spanish.
12. VoiceBridge preserves claim context and continues in Spanish.
13. Outcome card records status, missing docs, deadline, consent event, language switch, and memory update.

## Agent 1: Call Infrastructure Lead

Mission: make the LiveKit call work first.

Tasks:

- Scaffold or adapt the LiveKit agent starter.
- Create a browser-to-agent LiveKit room flow.
- Ensure the agent joins reliably.
- Ensure audio input and output work locally.
- Add a controlled insurer participant path before real SIP.
- Implement a minimal health screen: room connected, agent joined, mic active, audio output active.
- Document exact run commands.

Acceptance:

- `pnpm dev` or equivalent starts frontend and agent.
- Browser can start a call.
- Agent speaks back.
- A teammate can verify without touching sponsor integrations.

Dependencies:

- `.env` LiveKit keys.

Blocked by:

- Invalid LiveKit credentials.
- Missing starter scaffold.

Fallback:

- Use local browser room only, no SIP.

## Agent 2: Low-Latency Voice Lead

Mission: make responses sound good and fast.

Tasks:

- Implement a TTS adapter interface.
- Add ElevenLabs TTS using `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID`.
- Add MiniMax TTS adapter if API setup is confirmed.
- Choose the fastest reliable TTS for the demo.
- Support short response chunks so the agent starts speaking quickly.
- Log response latency from final text to first audio byte.

Acceptance:

- Agent can speak with the provided voice.
- Demo responses are not robotic or painfully slow.
- If MiniMax is blocked, ElevenLabs fallback works.

Dependencies:

- ElevenLabs credentials.
- MiniMax credentials and optional group ID.

Blocked by:

- Invalid voice provider credentials.

Fallback:

- Browser speech synthesis or LiveKit built-in voice path, but only as last resort.

## Agent 3: Conversation Orchestrator Lead

Mission: implement the deterministic demo conversation.

Tasks:

- Build the state machine for the insurance claim demo.
- Track call state: intro, returning-claim confirmation, consent gate, missing-docs question, language switch, outcome.
- Generate concise agent responses.
- Keep all claim approval/denial logic out of scope.
- Make the agent ask the user before sensitive disclosures.
- Ensure the same state machine works whether the insurer is a scripted participant or SIP participant.

Acceptance:

- Demo flow completes predictably.
- Agent never shares claim number before consent.
- Agent never approves, denies, or interprets the claim.

Dependencies:

- Agent 1 call path.
- Agent 2 voice path.

Blocked by:

- No stable call session.

Fallback:

- Text transcript mode while call infra is being fixed.

## Agent 4: MOSS Memory Lead

Mission: make returning-caller memory real.

Tasks:

- Create MOSS business knowledge and communication memory indexes.
- Seed demo memory for Ayush and claim H-48291.
- Implement `recall_customer_context`.
- Implement `remember_call_event`.
- Scope reads/writes by `tenant_id`, `user_id`, and `case_id`.
- Store consent approvals, language switch event, final outcome, and correction preference.

Acceptance:

- Same user/case recalls prior claim context.
- End-of-call outcome is written back to memory.
- Frontend can show at least one retrieval and one memory write.

Dependencies:

- MOSS credentials.

Blocked by:

- Invalid MOSS credentials or index setup failure.

Fallback:

- Local JSON memory with the same interface, then swap to MOSS.

## Agent 5: Consent And Guardrails Lead

Mission: prevent unsafe disclosures and unsafe claims.

Tasks:

- Implement `check_sensitive_disclosure`.
- Detect claim number, policy ID, address, date of loss, phone number, account number, payment details.
- Pause before disclosure and wait for user approval.
- Add hard guardrails:
  - do not approve or deny claims
  - do not give legal advice
  - do not give financial advice
  - do not move money or alter credentials
- Add TrueFoundry adapter interface.
- Use local guardrail fallback until TrueFoundry credentials are available.

Acceptance:

- Claim number request triggers consent UI.
- Decline path does not reveal sensitive data.
- Guardrail decision appears in frontend runtime trace.

Dependencies:

- Agent 3 orchestration.
- TrueFoundry credentials for live gateway.

Blocked by:

- Missing TrueFoundry credentials.

Fallback:

- Local policy engine with the same request/response shape.

## Agent 6: User Console Lead

Mission: build the member-facing control surface.

Tasks:

- Create the user intent input.
- Add quick action buttons for consent and choices.
- Add language switch input.
- Add correction buttons:
  - less formal
  - shorter
  - slower
  - ask me first next time
- Show live user-side prompts and choices.
- Keep layout fast and readable for demo.

Acceptance:

- User can drive the entire demo without speaking.
- Consent prompts are obvious.
- Language switch is a visible action.
- Correction action writes to memory through Agent 4.

Dependencies:

- Agent 3 state machine.
- Agent 4 memory interface.

Blocked by:

- No shared event protocol.

Fallback:

- Manual buttons wired to local state.

## Agent 7: Insurer Portal And Runtime Trace Lead

Mission: make the business value and sponsor usage visible.

Tasks:

- Build the business dashboard for Northstar Insurance.
- Show active call state.
- Show sponsor runtime trace:
  - LiveKit connected
  - MOSS retrieval
  - UnSiloed document used
  - TrueFoundry guardrail decision
  - Qwen language switch
  - MiniMax/ElevenLabs voice output
  - AWS audit saved or local audit fallback
- Show outcome card.
- Show consent events and audit log.

Acceptance:

- A judge can see why this is B2B2C.
- A judge can see all sponsors doing real work or faithful stubs.
- Outcome card is clear enough to screenshot.

Dependencies:

- Agents 3, 4, 5, 8, 9.

Blocked by:

- No event stream.

Fallback:

- Static runtime trace that updates from demo state events.

## Agent 8: Document Parsing And Business Knowledge Lead

Mission: make UnSiloed useful, not decorative.

Tasks:

- Create a demo claim notice / document request PDF or text fixture.
- Parse it with UnSiloed if credentials work.
- Extract missing documents, upload instructions, deadline language, escalation instructions.
- Index parsed output into MOSS business knowledge.
- Implement `search_business_knowledge`.
- Display parsed source in runtime trace.

Acceptance:

- Agent answer about upload/deadline can cite parsed business knowledge.
- If UnSiloed is unavailable, a pre-parsed fixture uses the same shape.

Dependencies:

- UnSiloed API key.
- MOSS business knowledge index.

Blocked by:

- API or document upload issues.

Fallback:

- Pre-parsed fixture committed to repo.

## Agent 9: Multilingual/Qwen Lead

Mission: make the mid-call language switch convincing.

Tasks:

- Add model adapter for Qwen via Alibaba Model Studio / DashScope.
- Confirm which credential path works:
  - DashScope API key
  - Alibaba access key pair
- Implement language switch detection.
- Preserve `case_id`, claim context, and consent state across language change.
- Generate user-side Spanish summary.
- Keep insurer-side response in English unless user explicitly wants otherwise.

Acceptance:

- User switches to Spanish mid-call.
- Agent keeps same claim context.
- User gets Spanish explanation.
- Outcome card records language switch.

Dependencies:

- Qwen/Alibaba credentials.
- Agent 3 call state.

Blocked by:

- Missing DashScope API key or unresolved Alibaba auth path.

Fallback:

- Local language detection for Spanish trigger plus templated Spanish response.

## Agent 10: Deployment, QA, And Demo Captain

Mission: make the demo reliable.

Tasks:

- Own the runbook.
- Own `.env.example` without secrets.
- Verify all required environment variables are either present or intentionally stubbed.
- Create smoke tests:
  - call starts
  - agent joins
  - TTS speaks
  - MOSS recall works
  - consent gate blocks claim number
  - language switch works
  - outcome card appears
- Add a one-command dev startup if possible.
- Prepare AWS deployment only after local demo is stable.
- Run the final 90-second demo script repeatedly.

Acceptance:

- Any teammate can run the local demo from the runbook.
- Demo works three times in a row.
- Missing optional integrations are clearly marked as stubbed.

Dependencies:

- All agents.

Blocked by:

- P0 call path not working.

Fallback:

- Use local-only demo with controlled room and faithful sponsor stubs.

## Parallel Coordination Rules

1. Agent 1 owns P0. Everyone else must provide mocks until the call works.
2. Agents 2, 3, 4, and 6 can start in parallel with mocked LiveKit events.
3. Agents 5, 8, and 9 should expose adapter interfaces early and fill real APIs later.
4. Agent 7 consumes events from everyone else and should not block core logic.
5. Agent 10 continuously verifies the integrated demo.

## Event Contract

All agents should emit simple JSON events:

```json
{
  "type": "consent.requested",
  "tenant_id": "northstar_insurance",
  "user_id": "ayush_demo",
  "case_id": "home_claim_H-48291",
  "timestamp": "2026-06-07T00:00:00Z",
  "payload": {}
}
```

Required event types:

- `call.started`
- `call.agent_joined`
- `call.audio_ready`
- `memory.recalled`
- `knowledge.retrieved`
- `consent.requested`
- `consent.approved`
- `guardrail.checked`
- `language.switched`
- `voice.spoken`
- `memory.written`
- `outcome.created`
- `audit.saved`

## First 2-Hour Build Order

1. Agent 1: prove browser LiveKit call and agent join.
2. Agent 2: make any low-latency voice response work.
3. Agent 3: implement scripted claim flow in text first, then voice.
4. Agent 6: wire user console to scripted flow.
5. Agent 4: add MOSS recall/write once flow works locally.
6. Agent 5: add consent gate before claim number.
7. Agent 7: add runtime trace and outcome card.
8. Agent 9: add language switch.
9. Agent 8: add UnSiloed parsed docs / fixture.
10. Agent 10: run full demo three times and record issues.

## Done Means

The project is not done when the spec is complete. It is done when the call works.

Minimum finish line:

- LiveKit call starts.
- Agent joins.
- Agent speaks.
- Claim context is recalled.
- Claim number is not shared until approved.
- User switches language.
- Agent preserves context.
- Outcome card is produced.
- Demo can be repeated reliably.

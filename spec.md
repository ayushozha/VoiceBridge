# CommandOS Spec

Status: Draft
Date: 2026-06-07
Primary track: Co-Pilot
Secondary track: Support

## One-Line Pitch

CommandOS is a conversational 3D incident intelligence OS for live business
incidents. A team talks to a voice orb, and the system builds the operating
workspace with them: spatial failure map, payment topology, prior-incident
memory, guarded mitigation plan, approval gate, and final dashboard/report.

## Hackathon Concept

The demo is not a generic dashboard and not a personal assistant.

The demo is a voice-first operating surface for business incidents. It starts
with nothing but an orb. The operator asks a vague operational question, then
CommandOS asks clarifying questions, builds a 3D model of the incident, recalls
a similar failure, recommends a safer fix, blocks an unsafe command, and turns
the investigation into a clean incident dashboard.

The core promise:

```text
Dashboards show what broke.
CommandOS talks through the incident with you, builds the live 3D model,
remembers what happened last time, blocks unsafe actions, and turns the whole
incident into an operating dashboard.
```

## Demo Title

CommandOS: Conversational 3D Incident Intelligence

## Demo Scenario

Fintech payments outage.

Business: AtlasPay, a fictional payment platform.

Incident:

- Premium customers in Texas are seeing failed payments.
- Failures are concentrated in Dallas, Austin, and Houston.
- The failure happens after gateway authorization and before processor
  confirmation.
- A similar Texas gateway incident happened last month.
- Restarting too early created duplicate-charge risk last time.
- The safer path is queue-depth check, traffic shift, controlled restart, and
  later regional load balancing.

## What Judges Should See

1. A blank screen with a single 3D orb.
2. The operator asks why payments are failing.
3. CommandOS asks clarifying questions instead of guessing.
4. A 3D map appears with failure hotspots.
5. A 3D payment topology appears and localizes the failure.
6. A prior incident ghost layer overlays the current incident.
7. The architecture morphs into a proposed mitigation.
8. A dangerous restart command is blocked until checks and approval.
9. The whole 3D investigation folds into a clean dashboard and report.

The judge should feel that the system is conversational, spatial, memory-aware,
and operationally governed.

## Reuse Assessment

This is a pivot in product story and visual surface, not a ground-up rewrite of
the stack.

### Reuse Directly

These pieces can stay conceptually intact:

- Next.js web app shell.
- Existing Three.js dependency and current CommandOS landing direction.
- LiveKit session/token foundation.
- Python LiveKit agent foundation.
- Typed event-stream architecture over LiveKit data channels.
- Memory event pattern: `memory.recalled`, `memory.written`.
- Knowledge event pattern: `knowledge.retrieved`.
- Guardrail event pattern: `guardrail.checked`.
- Language event pattern: `language.switched`.
- Voice event pattern: `voice.spoken`.
- Outcome/audit event pattern: `outcome.created`, `audit.saved`.
- Sponsor trace idea in the portal.
- Local stub strategy when sponsor credentials or live paths are blocked.

### Reuse With Renaming Or Thin Adaptation

These pieces should be adapted rather than thrown away:

- `/console` becomes the operator command surface.
- `/portal` becomes the incident command dashboard.
- `VoiceBridgeEvent` can remain as the technical event envelope for speed, but
  the visible product language should become CommandOS.
- Consent/approval patterns become operational approval gates.
- Sensitive-field guardrails become risky-action guardrails.
- MOSS memory moves from customer communication profile to incident memory and
  similar-failure recall.
- UnSiloed knowledge moves from claim documents to runbooks, escalation policy,
  and incident response docs.
- Outcome card becomes incident packet: timeline, mitigation, blocked action,
  customer update, and postmortem skeleton.

### Rewrite

These parts should be replaced:

- VoiceBridge product positioning.
- Insurance/accessibility phone-call narrative.
- Northstar Insurance claim workflow.
- End-user/caregiver persona.
- Claim-number consent flow.
- Insurer representative dialogue.
- Accessibility-first product principles.
- README/spec language that says the product is B2B2C phone access.

### New Work Needed

These are the main new demo surfaces:

- 3D orb state machine: idle, listening, thinking, building, speaking.
- 3D Texas failure map with city hotspots.
- 3D payment topology: app -> checkout API -> gateway -> processor -> bank rails.
- Failure localization animation.
- Prior-incident ghost overlay.
- Mitigation architecture morph with secondary gateway and load balancer.
- 3D approval card for blocked restart.
- Dashboard/report generation transition.
- New scripted conversational flow for the incident.

### Estimated Reuse

For a hackathon-scoped demo:

| Area | Reuse Estimate |
|---|---:|
| Runtime stack and package choices | 80% |
| Sponsor integration architecture | 70% |
| Typed event-stream pattern | 60% |
| Existing business logic text/data | 15% |
| Existing visible UI | 25% |
| Existing spec narrative | 10% |
| Overall app effort if scoped tightly | 50-60% |

The practical path is to reuse the runtime and rewrite the demo-facing
experience.

## Product Principles

1. Conversation before dashboard
   - CommandOS should ask useful follow-up questions.
   - The demo must not feel like a voice-triggered slideshow.

2. Spatial diagnosis first
   - The system should turn operational data into a 3D map and topology before
     showing a conventional dashboard.

3. Memory must change the recommendation
   - MOSS recall should not be decorative.
   - The prior incident must explain why a naive restart is unsafe.

4. Guardrails must block action
   - TrueFoundry/local policy must stop risky commands until required checks and
     human approval are satisfied.

5. The final artifact must be useful
   - The final dashboard/report should include root-cause hypothesis,
     mitigation, action log, customer update, and postmortem skeleton.

6. Be honest about live vs stubbed paths
   - Sponsor usage should be visible.
   - If a live integration is not actually called, label the local path clearly.

## Conversational Demo Flow

### Opening

Screen is black except for a glowing 3D orb.

Presenter says:

```text
This is CommandOS. Instead of opening dashboards, I talk to the operating
system and it builds the incident workspace with me.
```

### 1. Vague Question

Operator:

```text
CommandOS, why are payments failing?
```

CommandOS:

```text
Do you want me to inspect the last 15 minutes, last hour, or today?
```

Operator:

```text
Last hour. Premium customers only.
```

Expected UI:

- Orb opens.
- Listening ring changes to analysis state.
- Query scope appears as floating chips: `last hour`, `premium customers`.

### 2. 3D Map Appears

CommandOS builds a 3D map.

Expected UI:

- Texas rises from the orb.
- Dallas, Austin, and Houston pulse red.
- Failure beams animate over the region.
- Floating metrics show failure rate and affected segment.

CommandOS:

```text
I found a regional spike. Texas premium customers are failing at 18.4%,
compared with a 2.1% baseline. Should I inspect by city, payment method,
or processor?
```

Operator:

```text
City first.
```

### 3. Conversational Drilldown

Expected UI:

- Camera zooms into Dallas, Austin, and Houston.
- Dallas shows highest failed-transaction volume.
- Austin shows steepest spike.
- Houston shows secondary concentration.

CommandOS:

```text
Dallas has the highest volume. Austin has the steepest spike. Want me to
trace where the payment flow breaks?
```

Operator:

```text
Yes, trace the flow.
```

### 4. 3D Payment Topology

Expected UI:

The map connects to a floating architecture model:

```text
Customer app -> Checkout API -> Payment Gateway -> Processor -> Bank rails
```

The payment gateway glows red. Failed payment streams break between gateway
and processor.

CommandOS:

```text
Failures pass checkout validation and gateway authorization, then stall before
processor confirmation. This points to gateway queue saturation, not card
declines.
```

### 5. Self-Improving Harness

Operator:

```text
Have we seen this before?
```

Expected UI:

- A ghost layer overlays the current map.
- Prior incident hotspots align with the current Texas spike.
- A memory panel appears next to the 3D topology.

CommandOS:

```text
Yes. I found a similar Texas spike last month. Do you want the short version
or the full timeline?
```

Operator:

```text
Short version.
```

CommandOS:

```text
The team restarted too early. Queue depth was still high, and duplicate-charge
risk increased. The successful fix was shifting Texas traffic to a secondary
gateway before restart.
```

### 6. Recommendation In 3D

CommandOS:

```text
My recommendation is: check queue depth, shift Texas traffic to the secondary
gateway, then approve a controlled restart. Should I build the mitigation view?
```

Operator:

```text
Show me.
```

Expected UI:

- Secondary gateway appears.
- Load balancer appears.
- Texas traffic reroutes.
- Red payment streams become green.
- A mitigation sequence appears as numbered action cards.

### 7. Guardrail Moment

Operator:

```text
Just restart the gateway now.
```

CommandOS:

```text
I cannot recommend that yet. Queue depth is unknown, and this exact sequence
caused duplicate-charge risk last time. I can run the queue-depth check or
prepare an approval request. Which do you want?
```

Operator:

```text
Prepare the approval request.
```

### 8. Approval Card

Expected UI:

A 3D approval card appears:

- Requested action: controlled payment gateway restart.
- Status: blocked pending queue-depth check.
- Risk: duplicate charges and retry storms.
- Required check: queue depth below threshold.
- Required approver: Payments on-call.
- Prior incident warning: included.

CommandOS:

```text
Approval request prepared for controlled gateway restart after queue-depth
check. Should I include the prior incident warning?
```

Operator:

```text
Yes.
```

### 9. Dashboard Generation

CommandOS:

```text
Want this converted into a clean incident dashboard and report?
```

Operator:

```text
Yes, include a customer update.
```

Expected UI:

- 3D scene folds into a dashboard.
- The orb becomes a command/status node.
- The report fills from the event log.

### 10. Final Dashboard

Dashboard sections:

- 3D failure map.
- City-level payment failures.
- Payment topology.
- Prior incident match.
- Root-cause hypothesis.
- Recommended mitigation.
- Blocked unsafe action.
- Approval request.
- Customer update draft.
- Postmortem skeleton.
- Sponsor/runtime trace.

Final presenter line:

```text
Dashboards show what broke. CommandOS talks through the incident with you,
builds the live 3D model, remembers what happened last time, blocks unsafe
actions, and turns the whole incident into an operating dashboard.
```

## Demo Data

### Incident

```json
{
  "tenant_id": "atlaspay",
  "tenant_display_name": "AtlasPay",
  "incident_id": "sev1_tx_payments_2026_06_07",
  "incident_title": "Texas premium payment failures",
  "window": "last_hour",
  "segment": "premium_customers",
  "baseline_failure_rate": 0.021,
  "current_failure_rate": 0.184,
  "region": "Texas",
  "cities": [
    {
      "city": "Dallas",
      "failure_rate": 0.211,
      "failed_transactions": 1284,
      "note": "highest failed-transaction volume"
    },
    {
      "city": "Austin",
      "failure_rate": 0.297,
      "failed_transactions": 742,
      "note": "steepest spike"
    },
    {
      "city": "Houston",
      "failure_rate": 0.163,
      "failed_transactions": 618,
      "note": "secondary concentration"
    }
  ]
}
```

### Payment Topology

```json
{
  "nodes": [
    "customer_app",
    "checkout_api",
    "payment_gateway",
    "processor",
    "bank_rails"
  ],
  "suspected_failure_point": "payment_gateway_to_processor",
  "hypothesis": "gateway queue saturation",
  "not_likely": ["card_declines", "checkout_validation_failure"]
}
```

### Prior Incident Memory

```json
{
  "source": "moss",
  "similarity": 0.91,
  "incident": "may_2026_texas_gateway_saturation",
  "what_happened": "Texas payment failures spiked after gateway queues backed up.",
  "bad_action": "Gateway restart before queue-depth check increased duplicate-charge risk.",
  "successful_action": "Traffic shifted to secondary gateway, then a controlled restart was approved.",
  "owner": "payments_platform_on_call"
}
```

### Mitigation Plan

```json
{
  "recommended_sequence": [
    "check_gateway_queue_depth",
    "shift_texas_traffic_to_secondary_gateway",
    "prepare_controlled_restart_approval",
    "restart_gateway_after_approval",
    "add_regional_load_balancing_followup"
  ],
  "blocked_action": "restart_gateway_now",
  "block_reason": "queue depth unknown and duplicate-charge risk unresolved"
}
```

## Sponsor Fit

Every sponsor should be visible in the working path or in an honest local stub
that mirrors the integration contract.

### LiveKit

Role: real-time conversational transport.

Used for:

- Operator voice session.
- Agent audio path.
- Data-channel event stream for 3D scene state.
- Room/session identity.

Most visible moment:

- The orb responds conversationally and the UI updates from live command events.

### MOSS

Role: incident memory and self-improving harness.

Stores:

- Prior incident patterns.
- Failed mitigations.
- Successful mitigations.
- Incident owners.
- Region/system fingerprints.
- Final incident reports.

Most visible moment:

- CommandOS recalls the previous Texas gateway incident and changes its
  recommendation because restart alone was unsafe last time.

### UnSiloed

Role: parse unstructured incident docs and runbooks.

Parses:

- Payments outage runbook.
- Escalation policy.
- Approval checklist.
- Queue-depth restart policy.
- Customer communication template.

Most visible moment:

- CommandOS cites the operational rule that gateway restart requires queue-depth
  check and approval.

### TrueFoundry

Role: model routing, guardrails, and risky-action governance.

Enforces:

- Do not recommend restart until required checks pass.
- Do not execute or imply execution of risky infrastructure actions.
- Require approval for controlled restart.
- Log policy decisions.

Most visible moment:

- "Just restart the gateway now" is blocked.

### MiniMax

Role: low-latency spoken output.

Used for:

- Spoken incident status.
- Short operational updates.
- Voice confirmation that a risky action is blocked.

Most visible moment:

- CommandOS speaks the status update while the 3D scene changes.

### Qwen

Role: conversational reasoning and multilingual support.

Used for:

- Interpreting vague operator requests.
- Follow-up question generation.
- Optional multilingual support update.
- Routing language-aware summaries through the same incident context.

Most visible moment:

- CommandOS asks the right drilldown question instead of dumping a static report.

### AWS

Role: deployment and audit/event store.

Hosts or stores:

- Frontend.
- Agent/API backend.
- Incident event log.
- Audit records.
- Generated report packet.

Most visible moment:

- Final report and audit timeline are saved as an incident packet.

## Event Model

The current event envelope can be reused for speed:

```json
{
  "type": "event.type",
  "tenant_id": "atlaspay",
  "user_id": "ayush_demo",
  "case_id": "sev1_tx_payments_2026_06_07",
  "timestamp": "2026-06-07T00:00:00Z",
  "payload": {}
}
```

For the hackathon, the existing event types can be repurposed:

| Current Event | CommandOS Meaning |
|---|---|
| `call.started` | CommandOS voice session started |
| `call.agent_joined` | Incident agent joined |
| `call.audio_ready` | Orb is listening |
| `user.intent` | Operator command |
| `user.choice` | Operator drilldown choice |
| `agent.utterance` | CommandOS conversational response |
| `memory.recalled` | Prior incident retrieved |
| `knowledge.retrieved` | Runbook/policy retrieved |
| `guardrail.checked` | Risky action checked or blocked |
| `voice.spoken` | Spoken CommandOS status |
| `memory.written` | Incident learning or approval note stored |
| `outcome.created` | Incident dashboard/report created |
| `audit.saved` | Incident packet saved |

Recommended future event names:

- `incident.started`
- `query.scoped`
- `map.hotspot_detected`
- `topology.built`
- `failure.localized`
- `similar_incident.recalled`
- `mitigation.proposed`
- `approval.requested`
- `dashboard.generated`
- `report.created`

For this hackathon, do not block on renaming the whole contract if that risks
breaking the demo. Map the new semantics onto the existing event envelope and
rename visible UI copy first.

## Agent Tool Surface

CommandOS should expose a small tool surface:

1. `inspect_payment_failures`
   - Scopes the query by time window, customer segment, geography, and payment
     path.

2. `build_spatial_failure_model`
   - Produces the map, city hotspots, topology nodes, and animated failure
     paths.

3. `recall_similar_incidents`
   - Retrieves prior incidents with similarity, outcome, failed actions, and
     successful mitigations.

4. `retrieve_runbook_policy`
   - Pulls runbook and approval rules from parsed operational docs.

5. `propose_mitigation`
   - Builds the action sequence and proposed architecture change.

6. `check_action_guardrail`
   - Blocks risky actions until required checks and approvals exist.

7. `prepare_approval_request`
   - Creates an approval card with risks, preconditions, and approver.

8. `generate_incident_dashboard`
   - Converts the 3D investigation into a clean dashboard/report.

9. `speak_status`
   - Produces low-latency spoken updates.

## MVP Scope

### In Scope

- Single fictional fintech incident.
- Voice-orb opening state.
- Conversational investigation flow.
- 3D Texas failure map.
- 3D payment topology.
- Similar-incident memory recall.
- Runbook/approval policy retrieval.
- Recommended mitigation view.
- Blocked restart guardrail.
- Approval request card.
- Final dashboard/report generation.
- Sponsor trace with honest live/stub status.

### Out Of Scope

- Real production payment telemetry.
- Real infrastructure restart.
- Real customer data.
- Real cloud-console actions.
- Full incident-management replacement.
- PagerDuty/Slack/Jira/Datadog integrations.
- Multi-incident enterprise admin.
- Full production compliance posture.

## Implementation Path

Use the existing repo as the base.

1. Keep the package stack.
   - Next.js for web.
   - Three.js for 3D scenes.
   - LiveKit for voice/session/data channel.
   - Python agent and brain packages for runtime orchestration.
   - Existing contract package for typed event passing.

2. Update product story first.
   - `spec.md` becomes CommandOS.
   - Visible UI copy should stop saying VoiceBridge for the demo.
   - Console and portal should be reframed as CommandOS surfaces.

3. Build the scripted incident flow.
   - Use deterministic demo data.
   - Emit the same event envelope the current UI already understands.
   - Preserve pauses where the operator chooses drilldowns.

4. Build the 3D experience.
   - Orb.
   - Map.
   - City hotspots.
   - Payment topology.
   - Prior-incident overlay.
   - Mitigation morph.
   - Approval card.
   - Dashboard fold.

5. Keep sponsor observability.
   - Show which sponsor path produced memory, docs, guardrail, voice, and audit.
   - Label local fallbacks clearly.

## Runtime Flow

```text
Operator voice
  |
  v
LiveKit room/session
  |
  v
CommandOS agent
  |
  +--> Qwen/reasoning path
  |       - interpret vague query
  |       - ask follow-up questions
  |
  +--> MOSS memory path
  |       - recall similar incidents
  |       - store incident learning
  |
  +--> UnSiloed docs path
  |       - retrieve runbook and approval policy
  |
  +--> TrueFoundry guardrail path
  |       - block unsafe restart
  |       - require checks and approval
  |
  +--> MiniMax voice path
  |       - spoken status updates
  |
  +--> AWS/audit path
          - save event log and incident packet
```

The web UI listens to the same event stream and renders the current 3D state.

## Final Dashboard Contents

The generated dashboard/report should include:

- Incident title and severity.
- Time window and segment.
- Failure map.
- City breakdown.
- Payment topology.
- Root-cause hypothesis.
- Prior incident match.
- Recommended mitigation.
- Blocked unsafe action.
- Approval request.
- Customer update draft.
- Postmortem skeleton.
- Sponsor/runtime trace.
- Audit/event timeline.

## Success Criteria

The hackathon demo succeeds if a judge understands these points in under three
minutes:

1. The user talks to the system conversationally, not through dashboard filters.
2. CommandOS asks clarifying questions before deciding what to show.
3. A vague payments question becomes a 3D operational model.
4. The system identifies the likely failure point.
5. MOSS memory recalls a similar incident and changes the recommendation.
6. The mitigation is shown visually as an architecture change.
7. A risky restart command is blocked until checks and approval.
8. The 3D investigation becomes a usable dashboard/report.
9. Every sponsor has a visible role in the runtime trace.

## Risks

1. Too much visual polish, not enough product truth
   - Mitigation: include exact metrics, failure point, memory recall, and blocked
     action.

2. Too much dashboard, not enough conversation
   - Mitigation: CommandOS must ask follow-up questions and wait for operator
     choices.

3. Too generic a fix
   - Mitigation: avoid "just restart and add a load balancer" as the first
     answer. The credible answer is queue-depth check, traffic shift,
     controlled restart, then regional load balancing.

4. Sponsor usage feels decorative
   - Mitigation: show the sponsor trace for each major event.

5. Contract rename slows the build
   - Mitigation: keep the existing event envelope and rename visible copy first.

6. Live voice path fails during judging
   - Mitigation: keep a deterministic click/keyboard fallback that emits the
     same events and label it as demo fallback.

## Roadmap

### Hackathon MVP

- Scripted voice-orb demo.
- 3D incident map.
- 3D payment topology.
- Prior incident memory recall.
- Runbook/approval retrieval.
- Risky action block.
- Final dashboard/report.

### Pilot Product

- Integrations with incident tools.
- Real telemetry connectors.
- Slack/Teams command-room bridge.
- PagerDuty/Opsgenie alert ingestion.
- Datadog/New Relic/Grafana topology import.
- Jira/Linear follow-up ticket creation.
- Approval workflows tied to real on-call users.

### Enterprise Product

- Multi-team incident memory.
- Regulated-action policy engine.
- Architecture-aware simulation.
- Historical incident learning.
- Audit exports.
- Role-based approval paths.
- Postmortem automation.
- Customer communication workflow.

## Open Questions

1. Should the hackathon surface keep `/console` and `/portal`, or introduce a
   single `/command` route for the 3D demo?
2. Should the voice path be fully live for judging, or should the deterministic
   fallback be the primary demo driver?
3. How much of the final dashboard should be real generated text versus scripted
   event payload?
4. Should the 3D map be a stylized Texas model or an abstract regional incident
   grid?
5. Should Qwen be visible through multilingual support, conversational
   reasoning, or both?
6. Should the self-improving harness write a new MOSS memory at the end of the
   demo?
7. Should the sponsor trace stay in the final dashboard, or appear as a side
   rail during the 3D investigation?

## Final Framing

CommandOS is the voice-first 3D operating layer for live business incidents.

It turns a vague operational question into a conversational investigation, a
spatial failure model, a memory-backed recommendation, a guarded approval path,
and a clean incident dashboard.

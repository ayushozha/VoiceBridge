# VoiceBridge Spec

Status: Draft
Date: 2026-06-07
Primary track: Co-Pilot
Secondary track: Support

## One-Line Pitch

VoiceBridge is a business-deployed conversational access layer that helps insurers and financial-service organizations complete high-stakes phone workflows with customers who cannot reliably speak, hear, process, respond, or stay in one language in real time.

## Positioning

VoiceBridge is not a consumer calling assistant. It is not a generic AI that calls businesses for individuals.

VoiceBridge is B2B2C: the business buys and deploys it, and the consumer, member, claimant, or caregiver uses it during the call.

VoiceBridge is deployed by organizations that must serve people over the phone at scale:

- Insurers
- Banks and credit unions
- Fintech support teams
- Brokerages and benefits administrators
- Government benefits agencies
- Utilities and telecom providers
- Enterprise customer support teams with accessibility obligations

The institution deploys VoiceBridge so policyholders, members, customers, claimants, and caregivers can complete phone workflows through a memory-aware, consent-aware, multilingual AI communication proxy.

## Core Thesis

Phone access is still required for critical workflows, but many people cannot reliably complete those calls without help.

Existing solutions cover pieces of the problem:

- Relay services help with access, but they are not personalized memory systems.
- AAC tools help users speak, but they are not live call-completion agents.
- AI calling assistants can complete tasks, but they are consumer-first and not built as institutional accessibility infrastructure.
- Business call centers can offer human assistance, but they do not preserve a durable user-owned communication profile across calls.

VoiceBridge turns communication needs into a persistent, consent-aware profile that can be used across repeat calls, languages, and organizations.

## Primary Buyer

VoiceBridge is sold to businesses and institutions, not individual consumers.

### Beachhead Buyer

Insurance and financial access organizations:

- Property and casualty insurers
- Health insurers and Medicare Advantage plans
- Claims administrators
- Third-party administrators
- Insurance brokerages
- Benefits administrators
- Credit unions and regional banks with high phone-support volume
- Fintechs with regulated customer-support workflows

### Expansion Buyers

- Government agencies handling benefits access and document follow-up
- Utilities and telecom companies handling billing disputes and service restoration
- Universities handling financial aid and disability services
- Senior care organizations coordinating insurance, billing, and service calls
- Enterprise support teams with accessibility and compliance obligations

## End Users

The direct users are people who need help completing phone calls, including:

- People with speech disabilities
- People with hearing disabilities
- People using AAC
- People recovering from stroke or vocal injury
- People with ALS, Parkinson's, aphasia, or other communication-impacting conditions
- People with severe phone anxiety or selective mutism
- Older adults who struggle with phone workflows
- Non-native speakers who need simplified, paced phone support
- Multilingual customers who switch languages mid-call
- Caregivers assisting another person's calls

## Business Use Cases

### Insurance Use Cases

1. Claims follow-up
   - A policyholder uses VoiceBridge to ask about an auto, home, renters, or disability claim.
   - VoiceBridge asks before sharing claim number, policy ID, address, date of loss, or contact details.
   - The insurer receives a structured outcome: claim status, missing documents, deadline, and next action.

2. Returning claimant memory
   - The same policyholder calls again about the same claim.
   - VoiceBridge remembers the prior conversation, missing documents, preferred language, and communication style.
   - The call starts from context instead of forcing the user to repeat everything.

3. Document follow-up
   - The insurer asks for photos, receipts, repair estimates, police reports, or proof of loss.
   - VoiceBridge helps the user ask where to upload the documents and by what deadline.
   - The outcome card records required documents and next steps.

4. Benefits or coverage explanation
   - A member asks what a representative said about benefits, deductibles, or coverage status.
   - VoiceBridge does not interpret policy or promise coverage.
   - It asks clarifying questions, repeats the insurer's answer, and stores the reference number.

5. Multilingual member support
   - A caller begins in English and switches to Spanish, Hindi, or another supported language mid-call.
   - VoiceBridge keeps the same claim context while switching the user-side prompts and spoken output.
   - The insurer gets one coherent transcript and outcome record.

6. Caregiver-assisted insurance calls
   - A caregiver helps a member or policyholder complete a claims or benefits call.
   - VoiceBridge stores caregiver permissions and asks before allowing sensitive information to be shared.
   - The profile remembers when the caregiver can participate and what they may receive.

### Banking and Fintech Use Cases

1. Card dispute status
   - A customer calls about an existing dispute.
   - VoiceBridge asks before sharing account, card, transaction, or address details.
   - It records dispute status and next required action.

2. Account access support
   - A customer struggles with verification or lockout support.
   - VoiceBridge helps them communicate with the support representative.
   - It does not authenticate independently, move money, change passwords, or approve transactions.

3. Fraud or suspicious-activity follow-up
   - VoiceBridge helps a customer ask what action is needed.
   - It prompts the user before any sensitive disclosure.
   - It summarizes the institution's instructions without making fraud determinations.

### Enterprise Support Use Cases

1. Accessible customer support
   - A company embeds VoiceBridge into support workflows.
   - Customers who cannot speak or cannot stay in one language can complete phone-only tasks.
   - Support teams receive structured summaries and audit records.

2. Repeat customer continuity
   - A returning customer calls about the same issue.
   - VoiceBridge retrieves the prior call outcome, unresolved action, consent rules, and preferred language.
   - The business can continue the conversation without forcing the customer to restart.

## Product Principles

1. User agency first
   - VoiceBridge speaks for the user only within the user's confirmed intent.
   - The user can pause, correct, take over, or end the call.

2. Consent before sensitive disclosure
   - The system must not share sensitive personal, medical, insurance, financial, or identity details without explicit user confirmation.

3. Communication memory is the asset
   - The durable profile is more important than any single call.
   - MOSS stores user communication preferences, consent rules, corrections, and prior outcomes.

4. Institutional deployment, user-owned profile
   - Businesses deploy the service.
   - Users retain control over their communication profile and consent rules.

5. No medical, legal, financial, or coverage advice
   - VoiceBridge expresses user intent, asks questions, summarizes outcomes, and supports communication.
   - It does not interpret legal rights, give financial advice, move money, approve claims, deny claims, or promise insurance coverage.

6. Auditable by design
   - Every sensitive disclosure, correction, and profile change should have provenance.

## MVP Scope

The hackathon MVP should prove one controlled insurance claim workflow.

### In Scope

1. Business-deployed insurer portal
   - Demo organization: "Northstar Insurance"
   - Shows active calls, communication profile, consent events, and outcome summaries.

2. User console
   - User enters intent with text or quick actions.
   - User can approve or deny sensitive disclosures.
   - User can correct tone or pacing.

3. Controlled insurer call
   - A scripted insurer-side agent replaces a real third-party insurer.
   - This keeps the demo deterministic and scalable.

4. Communication profile
   - Stored in MOSS or a MOSS-shaped memory abstraction.
   - Includes style, pacing, preferred language, language-switch behavior, consent rules, caregiver permissions, corrections, and call history.

5. Consent gate
   - Detects requests for sensitive information.
   - Pauses the call flow and asks the user before sharing.

6. Voice response
   - VoiceBridge speaks to the insurer in natural language.
   - Responses should reflect the active communication profile.

7. Returning-caller memory
   - The same customer calls again.
   - VoiceBridge recalls the prior claim status, missing documents, and language preference.
   - The customer does not need to restate the whole issue.

8. Mid-call language switch
   - The customer switches from English to another language during the call.
   - VoiceBridge keeps the same claim context and continues comfortably in the new language.

9. Correction learning
   - User taps "less formal", "shorter", "slower", or "ask me first next time".
   - The profile updates immediately.
   - A replayed response shows changed behavior.

10. Outcome card
   - Summarizes call result.
   - Shows what was shared, what was approved, and what was learned.

### Out of Scope for MVP

- Real insurer outbound calling
- Production core insurance-system integration
- Real insurance integration
- Coverage decisions
- Claim approval or denial
- Emergency calling
- Open-ended autonomous calling
- Full regulated-compliance certification
- Consumer app-store distribution
- Multi-tenant enterprise administration beyond a demo-ready shell

## Demo Script

### Setup

Organization: Northstar Insurance

User profile:

- Name: Ayush
- Preferred style: short and direct
- Pacing: slow, with confirmation pauses
- Preferred language: English, with Spanish support
- Consent rule: ask before sharing claim number, policy ID, address, date of loss, or phone number
- Correction history: avoid overly formal phrasing
- Prior call memory: claim H-48291 is pending; insurer requested damage photos and repair estimate

### Step 1: User Starts Call

User intent:

```text
Ask about my home insurance claim. Keep it short. Ask before sharing my claim number.
```

VoiceBridge retrieves:

```text
Style: short and direct
Pacing: slow
Language: English, can switch to Spanish
Prior context: claim H-48291 pending, photos and repair estimate missing
Sensitive info: ask before claim number, policy ID, address, date of loss
```

Sponsor path:

```text
MOSS recalls profile + prior claim context
UnSiloed parsed the claim notice and document checklist
LiveKit carries the live call
TrueFoundry enforces disclosure and no-claim-decision guardrails
Qwen handles multilingual intent and Spanish switch
Minimax provides low-latency spoken output
AWS hosts the demo backend, audit events, and static frontend
```

### Step 2: Insurer Recognizes Returning Caller

Insurance representative:

```text
I see you called yesterday about a home claim. Are you calling about the same claim?
```

VoiceBridge asks the user:

```text
They found your prior call.
Should I confirm this is the same claim?

[Confirm same claim] [Different claim] [Ask what they see]
```

User selects:

```text
Confirm same claim
```

VoiceBridge:

```text
Yes, this is about the same home claim from yesterday.
```

### Step 3: Insurer Asks for Sensitive Information

Insurance representative:

```text
Can I have the claim number?
```

VoiceBridge pauses and shows:

```text
The insurer is asking for your claim number.
Can I share it?

[Share] [Type different answer] [Ask why]
```

User selects:

```text
Share
```

VoiceBridge:

```text
Yes, the claim number is H-48291.
```

### Step 4: Insurer Gives Next Steps

Insurance representative:

```text
The claim is still pending. We need photos of the damage and a repair estimate.
```

VoiceBridge asks:

```text
They need damage photos and a repair estimate.
What should I ask?

[Ask upload link] [Ask deadline] [Ask for adjuster]
```

User selects:

```text
Ask upload link
```

VoiceBridge:

```text
Where should the photos and repair estimate be uploaded, and is there a deadline?
```

### Step 5: User Switches Language Mid-Call

User types:

```text
Responde en espanol. Estoy nerviosa.
```

VoiceBridge updates the live call context:

```text
Language switch detected: Spanish
Keep same claim context
Use short, calm phrasing
```

Insurance representative:

```text
The deadline is Friday, and the upload link is in the claims portal.
```

VoiceBridge to user:

```text
Necesitan las fotos y el presupuesto antes del viernes. El enlace esta en el portal de reclamos.
```

VoiceBridge to insurer:

```text
Thank you. Please note that the claimant will upload the photos and repair estimate before Friday.
```

### Step 6: User Corrects Style

User taps:

```text
Less formal next time
```

MOSS profile update:

```text
Correction: use shorter, calmer wording for insurance claim calls.
Source: user correction during call.
Applies to: insurance claim follow-up.
```

### Step 7: Outcome

Outcome card:

```text
Claim status: pending
Claim number: H-48291
Missing documents: damage photos, repair estimate
Deadline: Friday
Sensitive info shared: claim number
Approval: user approved sharing claim number
Language switch: English to Spanish
Preference learned: shorter, calmer claim-call language
Follow-up: upload documents in claims portal
```

## Product Architecture

```text
Business Portal + User Console
      |
      v
AWS-hosted App/API  --->  Audit/Event Store
      |
      v
LiveKit Session  --->  Controlled Insurer Line
      |
      v
Call Orchestrator
      |
      +--> TrueFoundry Gateway / Guardrails
      |       - model routing
      |       - sensitive-disclosure policy
      |       - no claim approval/denial policy
      |
      +--> MOSS Memory Layer
      |       - communication memory index
      |       - business knowledge index
      |
      +--> UnSiloed Parsed Business Docs
      |       - claim letters
      |       - policy notices
      |       - upload instructions
      |
      +--> Qwen
      |       - multilingual reasoning
      |       - language switch detection
      |
      +--> Minimax
              - low-latency TTS
              - natural voice response
```

## Hackathon Implementation Path

Use the Moss Hacker Starter architecture as the practical build path:

- LiveKit Agents for the real-time voice session.
- LiveKit Inference or LiveKit-compatible model routing for STT and agent turn handling.
- MOSS for retrieval and durable memory.
- A React or Next.js frontend with a live context panel.
- A Python LiveKit agent with tools that read and write scoped MOSS memories.
- TrueFoundry as the gateway for model routing and guardrail enforcement.
- UnSiloed for parsing unstructured insurance documents into business knowledge.
- Minimax for low-latency spoken output.
- Qwen for multilingual reasoning and language-switch behavior.
- AWS for app/API hosting and audit-event persistence.

The sponsor integrations should not be decorative. Each one should be visible in either the call path, memory path, guardrail path, document path, or deployment path.

### Sponsor-Critical Runtime Flow

```text
1. UnSiloed parses an insurer claim notice and upload-instruction PDF.
2. Parsed business knowledge is indexed into MOSS.
3. MOSS stores the customer's communication profile and prior claim memory.
4. LiveKit starts the live call between user, VoiceBridge, and the controlled insurer line.
5. The agent routes model calls through TrueFoundry.
6. TrueFoundry blocks unsafe actions such as sharing claim number without approval or approving/denying the claim.
7. Qwen detects the English-to-Spanish switch and preserves the same claim context.
8. Minimax speaks the response with low latency.
9. AWS stores the transcript, consent event, language-switch event, and outcome card.
```

### Sponsor Integration Bar

For the hackathon, "used" means the sponsor has a necessary role in the working path or in a faithful local stub that mirrors the real integration contract.

Must be working in the demo:

- LiveKit live session
- MOSS retrieval and memory write
- Consent gate before sensitive disclosure
- Mid-call language switch behavior

Should be working if credentials/time allow:

- UnSiloed document parse into MOSS business knowledge
- Minimax spoken response
- Qwen multilingual model path
- TrueFoundry guardrail/model gateway
- AWS hosted deployment or audit event persistence

Acceptable fallback if integration setup is blocked:

- Use a pre-parsed UnSiloed-style claim document, but show the parser contract and resulting MOSS index entry.
- Use local guardrail code, but keep the TrueFoundry policy interface in the architecture.
- Use a local voice/model fallback, but keep Minimax/Qwen visible as the intended voice and multilingual providers.
- Run locally, but include AWS deployment path and audit store schema.

The final pitch should be honest about which integrations are live and which are represented by compatible stubs.

### MOSS Indexes

The MVP should use two MOSS indexes:

1. Business knowledge index
   - Stores insurer-side static knowledge.
   - Source: UnSiloed-parsed claim letters, document checklists, upload instructions, policy notice excerpts, escalation rules.

2. Communication memory index
   - Stores user and case memory.
   - Example memories: preferred language, pacing, consent rules, prior claim call summary, missing documents, correction history.

All memory reads and writes must be scoped by metadata:

```json
{
  "tenant_id": "northstar_insurance",
  "user_id": "ayush_demo",
  "case_id": "home_claim_H-48291"
}
```

The key demo point is that the same `user_id` and `case_id` produce continuity when the person calls again.

### Agent Tools

The voice agent should expose a small tool surface:

1. `search_business_knowledge`
   - Searches insurer-side docs, scripts, and rules.
   - Used for upload instructions, document requirements, escalation rules, and approved phrasing.

2. `recall_customer_context`
   - Retrieves prior call memory for the current user and case.
   - Used when the same customer calls again.

3. `remember_call_event`
   - Writes structured call events to MOSS.
   - Used for consent approvals, language switches, missing documents, preferences, and outcomes.

4. `check_sensitive_disclosure`
   - Classifies whether a requested field needs explicit user approval.
   - Used before claim number, policy ID, address, date of loss, phone number, or payment details are spoken.

5. `parse_business_document`
   - Calls UnSiloed to turn uploaded claim notices or policy PDFs into structured text.
   - Used before indexing business knowledge into MOSS.

6. `route_guarded_model_call`
   - Routes LLM and policy-check calls through TrueFoundry.
   - Used for governance, fallback routing, and guardrail checks.

7. `detect_language_switch`
   - Uses Qwen or the configured multilingual model to detect and preserve mid-call language changes.
   - Used when the user switches from English to Spanish or another supported language.

8. `speak_response`
   - Uses Minimax or the configured low-latency voice model to speak the next approved response.
   - Used after consent and guardrail checks pass.

### Frontend Context Events

The frontend should show MOSS activity in real time, similar to a knowledge matches panel:

- Retrieved prior call summary
- Retrieved communication preferences
- Consent rule matched
- Business knowledge match
- Language switch detected
- Memory write completed
- Outcome saved

The frontend should also expose sponsor-level observability:

- UnSiloed parsed source document
- MOSS retrieval score and matched memory
- TrueFoundry guardrail decision
- Qwen language-switch decision
- Minimax voice response event
- AWS audit event saved

This matters for judges because it makes MOSS visible. They should see memory retrieval and memory writes changing the call while it happens.

## Core Components

### 1. Business Portal

Business-facing surface for deployment and monitoring.

Capabilities:

- Configure organization identity
- Start or review assisted calls
- View consent events and call outcomes
- View accessibility usage metrics
- Export call summaries

### 2. User Console

End-user control surface.

Capabilities:

- Enter intent
- Select quick responses
- Approve sensitive disclosures
- Correct tone, pacing, and phrasing
- Pause or end call
- Review outcome

### 3. Consent Gate

Runtime safety layer.

Responsibilities:

- Detect requests for sensitive fields
- Classify field type
- Check user consent rules
- Pause before disclosure
- Record approval, denial, or alternate answer

Sensitive field examples:

- Date of birth
- Address
- Phone number
- Claim number
- Policy ID
- Date of loss
- Medication
- Social Security number
- Payment information
- Caregiver contact information

### 4. Call Orchestrator

Conversation manager that decides the next action.

Responsibilities:

- Maintain call state
- Generate response options for the user
- Produce spoken responses for the insurer
- Respect pacing and style preferences
- Preserve context across language switches
- Route sensitive details through the consent gate
- Produce structured outcome data

### 5. Communication Profile

MOSS-backed durable memory object.

Example schema:

```json
{
  "profile_id": "user_ayush_demo",
  "owner_type": "policyholder",
  "style_preferences": {
    "tone": "short_direct",
    "formality": "low",
    "pace": "slow",
    "verbosity": "concise"
  },
  "language_preferences": {
    "default": "en",
    "supported": ["en", "es"],
    "allow_mid_call_switch": true
  },
  "consent_rules": [
    {
      "field": "claim_number",
      "rule": "ask_every_time"
    },
    {
      "field": "policy_id",
      "rule": "ask_every_time"
    },
    {
      "field": "address",
      "rule": "ask_every_time"
    }
  ],
  "common_phrases": [
    "Please repeat that.",
    "I need a moment.",
    "Can you say that more simply?"
  ],
  "caregiver_permissions": [],
  "corrections": [
    {
      "scope": "insurance_claim_follow_up",
      "instruction": "Use shorter, calmer wording.",
      "source": "user_tap",
      "created_at": "2026-06-07T00:00:00Z"
    }
  ],
  "call_history": [
    {
      "organization": "Northstar Insurance",
      "topic": "home_claim_H-48291",
      "outcome": "claim_pending_documents_needed",
      "missing_documents": ["damage_photos", "repair_estimate"],
      "shared_sensitive_fields": ["claim_number"],
      "last_language": "es"
    }
  ]
}
```

### 6. Memory Writer

Writes durable, auditable changes.

Events:

- Consent approved
- Consent denied
- User correction received
- Outcome generated
- Profile preference updated
- Caregiver permission changed

Each event should include:

- Timestamp
- Actor
- Source
- Call ID
- Before value
- After value
- Reason

## Large-Scale Deployment Model

VoiceBridge should be designed as a multi-tenant business platform.

### Deployment Customers

Each customer is an organization:

- Insurer
- Claims administrator
- Benefits administrator
- Bank
- Credit union
- Fintech support organization
- Government agency
- Enterprise support organization

### Tenant Model

Each tenant has:

- Organization settings
- Approved call workflows
- Allowed data fields
- Consent policy defaults
- Staff dashboard access
- Audit logs
- Integration settings

Each end user has:

- Customer-owned, member-owned, or policyholder-owned communication profile
- Organization-specific call history
- Cross-organization preferences where authorized
- Consent and sharing rules
- Preferred languages and language-switch history
- Returning-issue memory for claims, disputes, cases, and benefits questions

### Scaling Requirements

1. Horizontal call scaling
   - Call sessions must run independently.
   - The call orchestrator should be stateless where possible.
   - Session state should be recoverable from event logs and memory.

2. Memory retrieval at low latency
   - Communication profile retrieval must happen before responses are generated.
   - Consent rules must be checked before any sensitive answer is spoken.
   - Prior issue memory must be retrieved when the same person calls again.
   - Language preference and current language must be available to the call orchestrator in real time.

3. Event-sourced audit trail
   - Every consent and profile update should be append-only.
   - Outcome summaries should be reproducible from call events.

4. Controlled workflow templates
   - Organizations should deploy approved workflows for claims, benefits, disputes, billing, document follow-up, and service restoration.
   - VoiceBridge should not improvise beyond allowed workflow boundaries.

5. Admin controls
   - Tenant admins can configure allowed fields and escalation rules.
   - Users can override personal preferences and consent behavior.

6. Observability
   - Track call completion rate.
   - Track consent prompts.
   - Track unresolved calls.
   - Track user corrections.
   - Track staff escalations.
   - Track latency and failure modes.

## Security, Privacy, and Compliance Guardrails

VoiceBridge is not production-compliant by default in the hackathon MVP. The product direction must assume production-grade controls for regulated insurance and financial-service environments.

Required production controls:

- Encryption in transit and at rest
- Per-tenant data isolation
- User-owned consent controls
- Role-based access control
- Audit logs for every sensitive disclosure
- Retention policies
- Deletion/export workflows
- Staff access review
- Incident monitoring
- No model training on customer data without explicit agreement
- Human escalation path

Insurance and financial-service deployment considerations:

- VoiceBridge should not approve or deny claims.
- VoiceBridge should not interpret policy language as legal or financial advice.
- VoiceBridge should not move money, change account credentials, or authorize transactions.
- Sensitive identifiers such as claim number, policy ID, account number, address, date of loss, and payment information must require explicit consent before disclosure.
- Human escalation is required for fraud, dispute, claim denial, coverage interpretation, account lockout, and legal-risk scenarios.
- For health insurance deployments, HIPAA obligations may apply when PHI is handled.

Telecom deployment considerations:

- Outbound AI-generated voice calls may trigger TCPA obligations unless a valid exemption or consent path applies.
- The product should identify itself when required.
- The MVP should use a controlled insurer line, not real outbound calls.

## Key Metrics

### Business Metrics

- Call completion rate
- Reduction in abandoned accessibility-related phone tasks
- Reduction in staff follow-up calls
- Average time to complete claim, benefit, dispute, or billing call
- Number of users served per organization
- Repeat usage per user
- Business retention

### Accessibility Metrics

- Number of calls completed without live caregiver intervention
- Number of successful consent-gated disclosures
- User correction rate
- Preference reuse rate
- User-reported confidence after calls

### Safety Metrics

- Sensitive disclosure without approval: must be zero
- Wrong-recipient disclosure: must be zero
- Financial, legal, or coverage advice generated by agent: must be zero
- Escalation rate for uncertain requests
- Audit event completeness

### Technical Metrics

- Response latency
- Memory retrieval latency
- TTS latency
- Consent prompt latency
- Call drop rate
- Transcript completeness

## Differentiation

VoiceBridge differs from consumer AI calling assistants by being:

- Business deployed
- Accessibility and compliance oriented
- Built around user-owned communication profiles
- Consent-aware by default
- Auditable for organizations
- Designed for repeat workflows, not one-off tasks
- Focused on high-stakes institutional calls

VoiceBridge differs from relay services by adding:

- Durable personalization
- Consent memory
- Outcome summaries
- Correction-based learning
- Integration with institutional workflows

VoiceBridge differs from AAC tools by adding:

- Live call orchestration
- Sensitive information gating
- Workflow completion
- Organization-facing deployment and auditability

## Sponsor Fit

Every sponsor should be used in the MVP path. The demo should show a compact "runtime trace" so judges can see each one doing real work.

### MOSS

Required role: core memory and retrieval layer.

Stores:

- Communication profiles
- Consent rules
- Prior claim context
- Correction history
- Language preferences
- Call outcomes
- Business knowledge retrieved from parsed documents

Most important demo moment:

- The profile changes the call behavior in real time.
- Example: user preference says "short and direct", so VoiceBridge speaks more concisely.
- Example: consent rule says "ask before claim number", so VoiceBridge pauses before sharing.
- Example: prior call memory says claim H-48291 is pending documents, so the next call starts from context.
- Example: language memory says Spanish is supported, so VoiceBridge switches language mid-call without losing claim state.

### LiveKit

Required role: real-time conversational transport.

Runs:

- Browser microphone/audio session
- VoiceBridge agent session
- Controlled insurer line
- Data packets for live context events
- Low-latency turn-taking

### TrueFoundry

Required role: model gateway, guardrails, and governance.

Enforces:

- Do not share sensitive fields without explicit approval
- Do not approve or deny claims
- Do not interpret policy as legal or financial advice
- Route multilingual/model calls to the correct model
- Log model and policy decisions for auditability

### UnSiloed AI

Required role: parse unstructured business knowledge.

Parses:

- Claim letters
- Policy notices
- Document requests
- Billing letters
- Benefits explanations
- Dispute notices
- Account-support instructions

The parsed output becomes MOSS business knowledge, so the agent can answer from insurer-approved source material instead of guessing.

### AWS

Required role: deployment and durable audit infrastructure.

Hosts:

- Frontend
- Agent/API backend
- Audit/event store
- Static uploaded demo documents
- Environment configuration and deployment path

The MVP can run locally during development, but the pitch should show AWS as the scalable deployment path for business customers.

### Minimax

Required role: low-latency speech output and natural response delivery.

Used for:

- Spoken responses to the insurer
- Calm, short, user-preferred voice style
- Fast response after consent and guardrail checks pass

### Qwen

Required role: multilingual reasoning and voice/language behavior.

Used for:

- Detecting mid-call language switches
- Keeping claim context stable across languages
- Generating user-side summaries in the preferred language
- Supporting multilingual voice design or model routing through TrueFoundry

## Risks

1. Too close to consumer AI calling assistants
   - Mitigation: pitch institutional accessibility infrastructure, not personal task automation.

2. Live outbound call failure during demo
   - Mitigation: use controlled insurer line.

3. Financial, legal, or coverage advice risk
   - Mitigation: restrict to communication support, representative clarification, and workflow completion.

4. Privacy concern
   - Mitigation: make consent gates and audit logs visible in the demo.

5. Procurement complexity
   - Mitigation: start with insurance administrators, brokerages, and regional insurers before large national carriers.

6. MOSS use feels generic
   - Mitigation: show memory changing the live response, not just storing summaries.

## Roadmap

### Hackathon MVP

- Controlled insurer call
- User console
- Consent gate
- MOSS-backed communication profile
- Returning-caller memory
- Mid-call language switch
- Correction learning
- Outcome card
- Insurer portal shell

### Pilot Product

- Real phone integration
- Organization tenant setup
- Staff dashboard
- Call templates for claims, benefits, disputes, billing, and document follow-up
- User profile portability
- Human escalation
- Audit export

### Enterprise Product

- CRM and claims-system integrations
- Insurance core-system and CRM integrations
- Banking and fintech support integrations
- Multilingual voice support
- Caregiver permission management
- Compliance reports
- Cross-organization communication profile portability
- Admin analytics
- Business-side accessibility operations dashboard

## Open Questions

1. Should the first buyer be property and casualty insurers, health insurers, or benefits administrators?
2. Should user profiles be institution-bound first, or portable from day one?
3. What is the minimum safe consent model for the first pilot?
4. Which sensitive fields must always require explicit confirmation?
5. Should VoiceBridge disclose itself at the start of every call in production?
6. Which workflows are safe enough for autonomous completion without staff escalation?
7. How should caregiver permissions be verified?
8. What is the right pricing model: per organization, per assisted call, or per covered user?
9. Which languages should be supported in the first demo and first pilot?
10. How much prior-call context should VoiceBridge reveal before asking the user for confirmation?

## Success Criteria

The MVP succeeds if a judge can understand and see all of this in under two minutes:

1. An insurer deploys VoiceBridge to make claim and member-service calls accessible.
2. A user enters intent without needing to speak.
3. VoiceBridge retrieves communication preferences and prior claim context from memory.
4. VoiceBridge recognizes the same person calling again and avoids forcing them to restart.
5. VoiceBridge pauses before sharing sensitive information.
6. The user approves the disclosure.
7. The user switches language mid-call and VoiceBridge keeps the same claim context.
8. VoiceBridge completes the claim follow-up workflow.
9. The user corrects style or pacing.
10. MOSS updates the communication profile.
11. The business receives a clear, auditable outcome.

## Final Framing

VoiceBridge is the business-deployed conversational access layer for high-stakes insurance and financial-service phone workflows.

It lets businesses serve customers who cannot reliably complete phone calls alone by combining live voice, returning-caller memory, language switching, user-owned communication profiles, consent gates, correction learning, and auditable outcomes at scale.

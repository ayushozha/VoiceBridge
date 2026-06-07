/**
 * LiveKit token-mint endpoint (Agent 1 foundation).
 *
 * Mints a short-lived JWT so a browser participant can join the demo room.
 * Server-side only — the API secret never reaches the client. Agent 1 extends
 * this (grants, agent dispatch, per-role identities for user vs insurer).
 *
 *   GET /api/token?identity=ayush_demo&role=user&room=voicebridge-demo
 */

import { NextRequest, NextResponse } from "next/server";
import { RoomAgentDispatch, RoomConfiguration } from "@livekit/protocol";
import { AccessToken, AgentDispatchClient, RoomServiceClient } from "livekit-server-sdk";
import { COMMANDOS_DEMO } from "@voicebridge/contracts";
import { serverEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

type Role = "user" | "insurer" | "observer";
const COMMANDOS_AGENT_NAME = process.env.COMMANDOS_AGENT_NAME ?? "commandos_live";
const COMMANDOS_AGENT_IDENTITY = "commandos_agent";
type AgentDispatchStatus = "created" | "existing" | "refreshed" | "skipped";

function identityFor(role: Role, override?: string): string {
  if (override) return override;
  switch (role) {
    case "user":
      return COMMANDOS_DEMO.userId;
    case "insurer":
      return "northstar_rep";
    case "observer":
      return "portal_observer";
  }
}

async function ensureCommandOSDispatch(room: string, metadata: string): Promise<AgentDispatchStatus> {
  const livekitUrl = serverEnv.livekitUrl();
  const livekitApiKey = serverEnv.livekitApiKey();
  const livekitApiSecret = serverEnv.livekitApiSecret();
  const dispatchClient = new AgentDispatchClient(
    livekitUrl,
    livekitApiKey,
    livekitApiSecret,
  );
  const roomClient = new RoomServiceClient(livekitUrl, livekitApiKey, livekitApiSecret);

  const participants = await roomClient.listParticipants(room).catch(() => []);
  const agentAlreadyJoined = participants.some((participant) => {
    const identity = participant.identity.toLowerCase();
    return identity === COMMANDOS_AGENT_IDENTITY || identity.includes("commandos");
  });
  if (agentAlreadyJoined) {
    return "existing";
  }

  const existing = await dispatchClient.listDispatch(room).catch(() => []);
  const staleDispatches = existing.filter((dispatch) => dispatch.agentName === COMMANDOS_AGENT_NAME);
  for (const dispatch of staleDispatches) {
    await dispatchClient.deleteDispatch(dispatch.id, room).catch(() => undefined);
  }

  try {
    await dispatchClient.createDispatch(room, COMMANDOS_AGENT_NAME, { metadata });
    return staleDispatches.length ? "refreshed" : "created";
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/already|exists|duplicate/i.test(message)) {
      return "existing";
    }
    throw err;
  }
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const role = (params.get("role") as Role) ?? "user";
  const identity = identityFor(role, params.get("identity") ?? undefined);
  const room = params.get("room") ?? serverEnv.roomName();

  try {
    const metadata = JSON.stringify({
      role,
      tenant_id: COMMANDOS_DEMO.tenantId,
      case_id: COMMANDOS_DEMO.caseId,
    });
    const agentDispatch =
      role === "user" ? await ensureCommandOSDispatch(room, metadata) : "skipped";

    const at = new AccessToken(serverEnv.livekitApiKey(), serverEnv.livekitApiSecret(), {
      identity,
      name: identity,
      // 1h TTL is plenty for a demo session.
      ttl: "1h",
      metadata,
    });

    // Observer (insurer portal) only needs to watch + receive data events.
    const canPublish = role !== "observer";
    at.addGrant({
      room,
      roomJoin: true,
      canPublish,
      canPublishData: true,
      canSubscribe: true,
    });

    // The backend worker registers with the same agent name.
    // Dispatch it when the operator enters Voice OS so the CTA starts a real call.
    if (role === "user") {
      at.roomConfig = new RoomConfiguration({
        agents: [
          new RoomAgentDispatch({
            agentName: COMMANDOS_AGENT_NAME,
            metadata,
          }),
        ],
      });
    }

    const token = await at.toJwt();
    return NextResponse.json({
      token,
      serverUrl: serverEnv.livekitUrl(),
      room,
      identity,
      role,
      agentDispatch,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "token generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

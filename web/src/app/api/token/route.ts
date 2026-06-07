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
import { AccessToken } from "livekit-server-sdk";
import { DEMO } from "@voicebridge/contracts";
import { serverEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

type Role = "user" | "insurer" | "observer";

function identityFor(role: Role, override?: string): string {
  if (override) return override;
  switch (role) {
    case "user":
      return DEMO.userId;
    case "insurer":
      return "northstar_rep";
    case "observer":
      return "portal_observer";
  }
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const role = (params.get("role") as Role) ?? "user";
  const identity = identityFor(role, params.get("identity") ?? undefined);
  const room = params.get("room") ?? serverEnv.roomName();

  try {
    const at = new AccessToken(serverEnv.livekitApiKey(), serverEnv.livekitApiSecret(), {
      identity,
      name: identity,
      // 1h TTL is plenty for a demo session.
      ttl: "1h",
      metadata: JSON.stringify({ role, tenant_id: DEMO.tenantId, case_id: DEMO.caseId }),
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

    const token = await at.toJwt();
    return NextResponse.json({
      token,
      serverUrl: serverEnv.livekitUrl(),
      room,
      identity,
      role,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "token generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Server-side env access for the web app. Mirrors the agent's config.py notion
 * of "live vs placeholder" so the UI can show which sponsor integrations are
 * real. Never import this from a client component — it reads secrets.
 */

import "server-only";

function val(name: string): string | undefined {
  const v = process.env[name]?.trim();
  if (!v) return undefined;
  if (v.startsWith("<") && v.endsWith(">")) return undefined;
  return v;
}

function required(name: string): string {
  const v = val(name);
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const serverEnv = {
  livekitUrl: () => required("LIVEKIT_URL"),
  livekitApiKey: () => required("LIVEKIT_API_KEY"),
  livekitApiSecret: () => required("LIVEKIT_API_SECRET"),
  roomName: () => process.env.VOICEBRIDGE_ROOM ?? "voicebridge-demo",
} as const;

/** Public-safe view of which sponsor integrations are configured. */
export function integrationModes() {
  const enabled = (name: string) => val(name) === "1" || val(name)?.toLowerCase() === "true";

  return {
    livekit: Boolean(val("LIVEKIT_URL") && val("LIVEKIT_API_KEY") && val("LIVEKIT_API_SECRET")),
    // These are intentionally gated by explicit runtime flags. Credentials can
    // be present while the current demo still uses local sponsor-shaped
    // adapters; showing "Live" must mean the backend actually calls that API.
    moss: Boolean(enabled("VOICEBRIDGE_MOSS_LIVE") && val("MOSS_PROJECT_ID") && val("MOSS_PROJECT_KEY")),
    unsiloed: Boolean(enabled("VOICEBRIDGE_UNSILOED_LIVE") && val("UNSILOED_API_KEY")),
    truefoundry: Boolean(
      enabled("VOICEBRIDGE_TRUEFOUNDRY_LIVE") &&
        val("TRUEFOUNDRY_API_KEY") &&
        val("TRUEFOUNDRY_GATEWAY_BASE_URL"),
    ),
    qwen: Boolean(enabled("VOICEBRIDGE_QWEN_LIVE") && val("DASHSCOPE_API_KEY") && val("QWEN_BASE_URL")),
    minimax: Boolean(val("MINIMAX_API_KEY")),
    elevenlabs: Boolean(val("ELEVENLABS_API_KEY") && val("ELEVENLABS_VOICE_ID")),
    aws: Boolean(enabled("VOICEBRIDGE_AWS_LIVE") && val("AWS_ACCESS_KEY_ID") && val("AWS_SECRET_ACCESS_KEY")),
  } as const;
}

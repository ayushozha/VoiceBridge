import Link from "next/link";
import { DEMO } from "@voicebridge/contracts";
import { VoiceBridgeHeroScene } from "@/components/VoiceBridgeHeroScene";

export default function Home() {
  return (
    <main className="relative min-h-[100dvh] overflow-hidden bg-[#f7fcff] text-[#112033]">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(135deg, #f7fcff 0%, #e9fbff 35%, #fff8e5 70%, #fff5fb 100%)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-45"
        style={{
          backgroundImage:
            "linear-gradient(rgba(17,32,51,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(17,32,51,0.08) 1px, transparent 1px)",
          backgroundSize: "42px 42px",
          maskImage:
            "linear-gradient(to bottom, rgba(0,0,0,0.72), rgba(0,0,0,0.28) 66%, transparent)",
        }}
      />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-[#38d6c5] via-[#6d8cff] to-[#ffbf3d]" />

      <div className="relative mx-auto flex min-h-[100dvh] max-w-7xl flex-col px-5 py-5 sm:px-7 lg:px-9">
        <nav className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/70 bg-white/70 shadow-[0_18px_45px_rgba(42,120,160,0.16),inset_0_1px_0_rgba(255,255,255,0.9)]">
              <span className="h-3 w-3 rounded-full bg-[#38d6c5] shadow-[0_0_18px_rgba(56,214,197,0.9)]" />
            </span>
            <div>
              <p className="text-sm font-semibold text-[#112033]">VoiceBridge</p>
              <p className="text-xs text-[#55687d]">{DEMO.tenantDisplayName}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/console"
              className="rounded-lg border border-[#bbd2e4] bg-white/60 px-3 py-2 text-sm font-semibold text-[#31506d] shadow-[0_12px_30px_rgba(49,80,109,0.09)] transition duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-0.5 hover:border-[#6d8cff] hover:bg-white"
            >
              Console
            </Link>
            <Link
              href="/portal"
              className="rounded-lg border border-[#38d6c5]/[0.55] bg-[#38d6c5]/[0.18] px-3 py-2 text-sm font-semibold text-[#0e5360] shadow-[0_16px_36px_rgba(56,214,197,0.18)] transition duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-0.5 hover:border-[#ffbf3d] hover:bg-[#ffbf3d]/20"
            >
              Portal
            </Link>
          </div>
        </nav>

        <section className="grid flex-1 items-center gap-8 py-8 lg:grid-cols-[0.82fr_1.18fr] lg:py-12">
          <div className="max-w-xl">
            <div className="mb-5 inline-flex rounded-lg border border-[#c6dde8] bg-white/60 px-3 py-2 text-sm font-semibold text-[#0f7c86] shadow-[0_12px_35px_rgba(42,120,160,0.1)]">
              Consent-aware voice layer
            </div>
            <h1 className="text-5xl font-bold leading-[1.02] text-[#112033] sm:text-7xl">
              VoiceBridge
            </h1>
            <p className="mt-5 text-lg leading-8 text-[#52677d]">
              Member voice becomes business action through a guarded AI bridge:
              consent, memory, language, and audit move together.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href="/portal"
                className="rounded-lg border border-[#38d6c5]/60 bg-[#38d6c5]/[0.22] px-5 py-3 text-sm font-semibold text-[#0e5360] shadow-[0_22px_50px_rgba(56,214,197,0.22)] transition duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-1 hover:border-[#ffbf3d] hover:bg-[#ffbf3d]/20"
              >
                Open portal
              </Link>
              <Link
                href="/console"
                className="rounded-lg border border-[#b8cee0] bg-white/70 px-5 py-3 text-sm font-semibold text-[#31506d] shadow-[0_22px_50px_rgba(49,80,109,0.1)] transition duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-1 hover:border-[#6d8cff] hover:bg-white"
              >
                Open console
              </Link>
            </div>
          </div>

          <VoiceBridgeHeroScene />
        </section>
      </div>
    </main>
  );
}

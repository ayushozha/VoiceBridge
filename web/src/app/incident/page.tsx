import type { Metadata } from "next";
import { IncidentHUDPage } from "./IncidentHUDPage";

export const metadata: Metadata = {
  title: "CommandOS — Incident Intelligence",
  description: "Real-time AI-driven incident analysis and mitigation orchestration.",
};

export default function IncidentPage() {
  return <IncidentHUDPage />;
}

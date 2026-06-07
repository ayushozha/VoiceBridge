"use client";

/**
 * DynamicPanel - renders an agent-built `hud.component` using the same visual
 * language as the hardcoded `.hud-panel` cards in IncidentHUD.
 *
 * The agent emits `hud.component` events (render / patch / remove) to build and
 * mutate arbitrary panels live. This presentational component maps each
 * `component` kind onto the existing HUD CSS classes (.hud-panel, .bigstat,
 * .barrow, .steps, ...) so a generated card is indistinguishable from a baked-in
 * one. A keyed opacity pulse animates each patch so the operator sees the
 * preview update.
 */

import React from "react";
import type { HudComponentItem, HudComponentPayload } from "@voicebridge/contracts";

/** Format a value + optional unit for display. */
function fmtValue(item: HudComponentItem): string {
  const v = typeof item.value === "number" ? String(item.value) : item.value;
  return item.unit ? `${v}` : v;
}

/** Delta arrow + sign, coloured by direction. */
function Delta({ delta }: { delta?: number }) {
  if (delta === undefined || delta === 0) return null;
  const up = delta > 0;
  return (
    <span
      style={{
        marginLeft: 8,
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 12,
        color: up ? "var(--red)" : "var(--green)",
      }}
    >
      {up ? "^" : "v"} {Math.abs(delta)}
    </span>
  );
}

function MetricGrid({ items }: { items: HudComponentItem[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 4 }}>
      {items.map((item, i) => (
        <div key={`${item.label}-${i}`} style={{ minWidth: 0 }}>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "var(--mist)", marginBottom: 4 }}>
            {item.label}
          </div>
          <div className="bigstat">
            <span
              className={`v${item.emphasis ? " red" : ""}`}
              style={{ fontSize: 28, lineHeight: 1, color: item.emphasis ? undefined : "var(--ink)" }}
            >
              {fmtValue(item)}
              {item.unit && <span style={{ fontSize: 15, color: "var(--mist)", marginLeft: 3 }}>{item.unit}</span>}
            </span>
          </div>
          <Delta delta={item.delta} />
        </div>
      ))}
    </div>
  );
}

function BarChart({ items }: { items: HudComponentItem[] }) {
  const max = Math.max(
    1,
    ...items.map((it) => (typeof it.value === "number" ? it.value : parseFloat(String(it.value)) || 0)),
  );
  return (
    <div style={{ marginTop: 2 }}>
      {items.map((item, i) => {
        const num = typeof item.value === "number" ? item.value : parseFloat(String(item.value)) || 0;
        const pct = Math.max(2, Math.min(100, (num / max) * 100));
        return (
          <div className="barrow" key={`${item.label}-${i}`}>
            <span className="lab" style={item.emphasis ? { color: "var(--amber)" } : undefined}>
              {item.label}
            </span>
            <div className="track">
              <div
                className="fill"
                style={{
                  width: `${pct}%`,
                  background: item.emphasis
                    ? "linear-gradient(90deg,var(--amber),var(--red))"
                    : undefined,
                }}
              />
            </div>
            <span className="num">
              {fmtValue(item)}
              {item.unit ?? ""}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function RankedList({ items }: { items: HudComponentItem[] }) {
  return (
    <div className="steps">
      {items.map((item, i) => (
        <div className="step" key={`${item.label}-${i}`}>
          <span className="n">{i + 1}</span>
          <span className="tx">
            {item.label}
            <i>
              {fmtValue(item)}
              {item.unit ? ` ${item.unit}` : ""}
            </i>
          </span>
        </div>
      ))}
    </div>
  );
}

function Callout({ data }: { data: HudComponentPayload }) {
  const first = data.items?.[0];
  return (
    <div style={{ marginTop: 4 }}>
      {first ? (
        <div className="bigstat">
          <span className={`v${first.emphasis ? " red" : ""}`} style={{ fontSize: 40 }}>
            {fmtValue(first)}
            {first.unit && <span style={{ fontSize: 22, color: "var(--mist)" }}>{first.unit}</span>}
          </span>
          <span className="u">{first.label}</span>
        </div>
      ) : null}
      {data.subtitle && <div className="note">{data.subtitle}</div>}
    </div>
  );
}

function Timeline({ items }: { items: HudComponentItem[] }) {
  return (
    <div className="steps">
      {items.map((item, i) => (
        <div className="step" key={`${item.label}-${i}`}>
          <span className="n" style={{ borderRadius: "50%" }}>
            {i + 1}
          </span>
          <span className="tx">
            {item.label}
            <i>
              {fmtValue(item)}
              {item.unit ? ` ${item.unit}` : ""}
            </i>
          </span>
        </div>
      ))}
    </div>
  );
}

function MapLegend({ items }: { items: HudComponentItem[] }) {
  return (
    <div style={{ marginTop: 2 }}>
      {items.map((item, i) => (
        <div className="sub-row" key={`${item.label}-${i}`}>
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                width: 8,
                height: 8,
                transform: "rotate(45deg)",
                background: item.emphasis ? "var(--red)" : "var(--cyan)",
                boxShadow: `0 0 8px ${item.emphasis ? "var(--red)" : "var(--cyan)"}`,
                display: "inline-block",
              }}
            />
            {item.label}
          </span>
          <b>
            {fmtValue(item)}
            {item.unit ? ` ${item.unit}` : ""}
          </b>
        </div>
      ))}
    </div>
  );
}

function Body({ data }: { data: HudComponentPayload }) {
  const items = data.items ?? [];
  switch (data.component) {
    case "metric_grid":
      return <MetricGrid items={items} />;
    case "bar_chart":
      return <BarChart items={items} />;
    case "ranked_list":
      return <RankedList items={items} />;
    case "callout":
      return <Callout data={data} />;
    case "timeline":
      return <Timeline items={items} />;
    case "map":
      return <MapLegend items={items} />;
    default:
      return null;
  }
}

/**
 * One agent-built panel. Always rendered "on" (visible) - visibility/removal is
 * controlled by the parent dropping it from the registry. The `key` on the
 * outer element (set by the parent via `data.id`) plus a CSS animation give a
 * visible pulse whenever the payload object identity changes (i.e. a patch).
 */
export function DynamicPanel({ data }: { data: HudComponentPayload }) {
  // A stable signature of the mutable fields. Used as the React `key` on the
  // inner content wrapper so a render/patch (which produces a new signature)
  // remounts just the content and restarts the `hud-dyn-pulse` keyframe - the
  // panel visibly "updates the preview" without disturbing list ordering.
  const sig = React.useMemo(
    () => `${data.title ?? ""}|${data.subtitle ?? ""}|${(data.items ?? []).length}`,
    [data],
  );

  return (
    <div className="hud-panel on" style={{ position: "relative", width: "100%" }}>
      <span className="hud-corner tl" />
      <span className="hud-corner br" />
      <div key={sig} style={{ animation: "hud-dyn-pulse .5s ease-out" }}>
        <h4>{data.title ?? data.component.replace(/_/g, " ")}</h4>
        {data.subtitle && data.component !== "callout" && (
          <div className="sub-row" style={{ marginTop: -4, marginBottom: 6 }}>
            <span>{data.subtitle}</span>
          </div>
        )}
        <Body data={data} />
        {data.source && (
          <div
            style={{
              marginTop: 10,
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 10.5,
              color: "var(--mist)",
              opacity: 0.8,
            }}
          >
            source - <b style={{ color: "var(--cyan)" }}>{data.source}</b>
          </div>
        )}
      </div>
    </div>
  );
}

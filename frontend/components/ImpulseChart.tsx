"use client";

import { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from "recharts";

interface PricePoint {
  ts: number;
  up: number;
  down: number;
  time: string;
  impulse?: { side: string; price: number };
}

interface ImpulseEvent {
  ts: number;
  price: number;
  side: string;
  time: string;
}

interface ImpulseChartProps {
  upHistory: { ts: number; price: number }[];
  downHistory: { ts: number; price: number }[];
  limitPrice?: number;
  upPrice: number | null;
  downPrice: number | null;
  marketStartTime: number | null;
  marketEndTime: number | null;
  impulseEvents: ImpulseEvent[];
  wsConnected?: boolean;
}

/* Polygon hexagon - points for a small hexagon centered at (0,0) */
const POLYGON_HEX = "M0,-6 L5.2,-3 L5.2,3 L0,6 L-5.2,3 L-5.2,-3 Z";

function ImpulseDot(props: { cx?: number; cy?: number; payload?: PricePoint }) {
  const { cx, cy, payload } = props;
  if (!payload?.impulse || cx == null || cy == null) return null;
  const isUp = payload.impulse.side === "Up";
  const fill = isUp ? "#22c55e" : "#ef4444"; /* green/red with Polygon purple outline */
  return (
    <g transform={`translate(${cx},${cy})`}>
      <path
        d={POLYGON_HEX}
        fill={fill}
        stroke="#8247E5"
        strokeWidth={1.5}
      />
    </g>
  );
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ payload: PricePoint }>; label?: string }) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload;
  if (!p) return null;
  const timeStr = new Date(p.ts * 1000).toLocaleTimeString();
  return (
    <div className="card" style={{ padding: 8, minWidth: 140 }}>
      <div style={{ marginBottom: 4 }}>
        <strong>Time:</strong> {timeStr}
      </div>
      <div>
        <span style={{ color: "var(--success)" }}>Up:</span> {p.up.toFixed(3)}
      </div>
      <div>
        <span style={{ color: "var(--error)" }}>Down:</span> {p.down.toFixed(3)}
      </div>
      {p.impulse && (
        <div style={{ marginTop: 4, color: "#8247E5" }}>
          Impulse {p.impulse.side} @ {p.impulse.price.toFixed(3)}
        </div>
      )}
    </div>
  );
}

export function ImpulseChart({
  upHistory,
  downHistory,
  limitPrice = 0.55,
  upPrice,
  downPrice,
  marketStartTime,
  marketEndTime,
  impulseEvents = [],
  wsConnected = false,
}: ImpulseChartProps) {
  const data = useMemo<PricePoint[]>(() => {
    const start = marketStartTime ?? 0;
    const end = marketEndTime ?? Number.MAX_SAFE_INTEGER;

    const inWindow = (ts: number) => ts >= start && ts <= end;

    const upFiltered = upHistory.filter((p) => inWindow(p.ts));
    const downFiltered = downHistory.filter((p) => inWindow(p.ts));

    const impulseInWindow = impulseEvents.filter((e) => inWindow(e.ts));

    if (!upFiltered.length && !downFiltered.length && !impulseInWindow.length) return [];

    const upMap = new Map(upFiltered.map((p) => [p.ts, p.price]));
    const downMap = new Map(downFiltered.map((p) => [p.ts, p.price]));
    const allTs = new Set([...upMap.keys(), ...downMap.keys(), ...impulseInWindow.map((e) => e.ts)]);

    const nowTs = Math.floor(Date.now() / 1000);
    const hasCurrent =
      upPrice != null &&
      downPrice != null &&
      Number.isFinite(upPrice) &&
      Number.isFinite(downPrice) &&
      inWindow(nowTs);

    if (hasCurrent) {
      allTs.add(nowTs);
      upMap.set(nowTs, upPrice);
      downMap.set(nowTs, downPrice);
    }

    const impulseByTs = new Map(impulseInWindow.map((e) => [e.ts, e]));

    const sorted = Array.from(allTs).sort((a, b) => a - b);
    const lastFromHistory = (arr: { ts: number; price: number }[]) =>
      arr.length ? [...arr].sort((a, b) => b.ts - a.ts)[0]?.price : null;
    let lastUp = (upPrice != null && Number.isFinite(upPrice))
      ? upPrice
      : lastFromHistory(upFiltered);
    let lastDown = (downPrice != null && Number.isFinite(downPrice))
      ? downPrice
      : lastFromHistory(downFiltered);
    if (lastUp == null) lastUp = lastDown != null ? 1 - lastDown : 0.5;
    if (lastDown == null) lastDown = lastUp != null ? 1 - lastUp : 0.5;

    return sorted.map((ts) => {
      const imp = impulseByTs.get(ts);
      const upVal = upMap.get(ts) ?? (imp?.side === "Up" ? imp.price : undefined);
      const downVal = downMap.get(ts) ?? (imp?.side === "Down" ? imp.price : undefined);
      const up = upVal != null && upVal > 0 ? upVal : lastUp;
      const down = downVal != null && downVal > 0 ? downVal : lastDown;
      if (upVal != null && upVal > 0) lastUp = upVal;
      if (downVal != null && downVal > 0) lastDown = downVal;
      return {
        ts,
        up,
        down,
        time: new Date(ts * 1000).toLocaleTimeString(),
        ...(imp ? { impulse: { side: imp.side, price: imp.price } } : {}),
      };
    });
  }, [upHistory, downHistory, upPrice, downPrice, marketStartTime, marketEndTime, impulseEvents]);

  if (data.length < 2) {
    return (
      <div className="card" style={{ minHeight: 240 }}>
        <div className="cardTitle">Up / Down Price (current market)</div>
        <div className="loading">Waiting for price data…</div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="cardTitle">
        Up / Down Price (current market)
        {wsConnected && <span style={{ color: "var(--success)", fontSize: "0.75rem", marginLeft: 6 }}>● live</span>}
      </div>
      <div style={{ height: 280 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
            <XAxis
              dataKey="ts"
              type="number"
              domain={
                marketStartTime != null && marketEndTime != null
                  ? [marketStartTime, marketEndTime]
                  : ["dataMin", "dataMax"]
              }
              tickFormatter={(ts) => new Date(ts * 1000).toLocaleTimeString()}
              stroke="var(--text-secondary)"
              fontSize={11}
            />
            <YAxis
              domain={[0, 1]}
              ticks={[0, 0.05, 0.10, 0.15, 0.20, 0.25, 0.30, 0.35, 0.40, 0.45, 0.50, 0.55, 0.60, 0.65, 0.70, 0.75, 0.80, 0.85, 0.90, 0.95, 1]}
              stroke="var(--text-secondary)"
              fontSize={11}
              tickFormatter={(v) => v.toFixed(2)}
            />
            {limitPrice > 0 && (
              <ReferenceLine
                y={limitPrice}
                stroke="var(--warning)"
                strokeDasharray="4 4"
                label={{ value: `Limit ${limitPrice}`, fill: "var(--warning)" }}
              />
            )}
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Line
              type="monotone"
              dataKey="up"
              stroke="var(--success)"
              dot={(props) => {
                const p = props.payload as PricePoint;
                return p?.impulse && p.impulse.side === "Up" ? (
                  <ImpulseDot cx={props.cx} cy={props.cy} payload={p} />
                ) : (
                  <g />
                );
              }}
              name="Up"
              strokeWidth={2}
            />
            <Line
              type="monotone"
              dataKey="down"
              stroke="var(--error)"
              dot={(props) => {
                const p = props.payload as PricePoint;
                return p?.impulse && p.impulse.side === "Down" ? (
                  <ImpulseDot cx={props.cx} cy={props.cy} payload={p} />
                ) : (
                  <g />
                );
              }}
              name="Down"
              strokeWidth={2}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {impulseEvents.length > 0 && (
        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: 4 }}>
          Hexagon = impulse buy (Polygon) · hover for time
        </div>
      )}
    </div>
  );
}

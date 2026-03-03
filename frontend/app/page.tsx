"use client";

import { useState, useEffect, useCallback } from "react";
import { ImpulseChart } from "@/components/ImpulseChart";
import { usePolymarketPriceWebSocket } from "@/hooks/usePolymarketPriceWebSocket";

const API_BASE = "/api";
const POLL_MS = 5000;

interface ImpulseEvent {
  ts: number;
  price: number;
  side: string;
  time: string;
}

interface ImpulseState {
  upPrice: number | null;
  downPrice: number | null;
  upTokenId: string | null;
  downTokenId: string | null;
  position: { side: string; highestPrice: number } | null;
  conditionId: string | null;
  currentSlug?: string | null;
  marketStartTime: number | null;
  marketEndTime: number | null;
  priceHistory: {
    up: { ts: number; price: number }[];
    down: { ts: number; price: number }[];
  } | null;
  impulseEvents: ImpulseEvent[];
  walletBalanceUsd: number | null;
  positionValueUsd: number | null;
}

interface ImpulseBuy {
  conditionId: string;
  eventSlug: string;
  side: string;
  type: string;
  price: number;
  amountUsd: number;
  shares: number;
  boughtAt: number;
}

export default function Home() {
  const [state, setState] = useState<ImpulseState | null>(null);
  const [buys, setBuys] = useState<ImpulseBuy[]>([]);
  const [config, setConfig] = useState<{ limitPrice?: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [stateRes, buysRes, configRes] = await Promise.all([
        fetch(`${API_BASE}/impulse-state?includeHistory=1`),
        fetch(`${API_BASE}/impulse-buys`),
        fetch(`${API_BASE}/bot-config`),
      ]);
      const stateData = await stateRes.json();
      const buysData = await buysRes.json();
      const configData = await configRes.json();

      setState(stateData);
      setBuys(Array.isArray(buysData) ? buysData : []);
      setConfig(configData.config || {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  const { liveUpPrice, liveDownPrice, wsConnected } = usePolymarketPriceWebSocket(
    state?.upTokenId ?? null,
    state?.downTokenId ?? null
  );

  const chartUpPrice = wsConnected && liveUpPrice != null ? liveUpPrice : (state?.upPrice ?? null);
  const chartDownPrice = wsConnected && liveDownPrice != null ? liveDownPrice : (state?.downPrice ?? null);
  const displayUpPrice = chartUpPrice;
  const displayDownPrice = chartDownPrice;

  if (loading) return <div className="loading">Loading…</div>;
  if (error) return <div className="loading" style={{ color: "var(--error)" }}>{error}</div>;

  return (
    <>
      <h1 className="sectionTitle">Polymarket Impulse Bot Dashboard</h1>

      <div className="statusGrid">
        <div className="card">
          <div className="cardTitle">
            Up Price {wsConnected ? <span style={{ color: "var(--success)", fontSize: "0.75rem" }}>● live</span> : ""}
          </div>
          <div className="cardValue">
            {displayUpPrice != null ? displayUpPrice.toFixed(3) : "—"}
          </div>
        </div>
        <div className="card">
          <div className="cardTitle">
            Down Price {wsConnected ? <span style={{ color: "var(--success)", fontSize: "0.75rem" }}>● live</span> : ""}
          </div>
          <div className="cardValue">
            {displayDownPrice != null ? displayDownPrice.toFixed(3) : "—"}
          </div>
        </div>
        <div className="card">
          <div className="cardTitle">Position</div>
          <div className="cardValue">
            {state?.position
              ? `${state.position.side} @ high ${state.position.highestPrice.toFixed(2)}`
              : "None"}
          </div>
        </div>
        <div className="card">
          <div className="cardTitle">Position Value</div>
          <div className="cardValue">
            {state?.positionValueUsd != null ? `$${state.positionValueUsd.toFixed(2)}` : "—"}
          </div>
        </div>
        <div className="card">
          <div className="cardTitle">Wallet Balance</div>
          <div className="cardValue">
            {state?.walletBalanceUsd != null ? `$${state.walletBalanceUsd.toFixed(2)}` : "—"}
          </div>
        </div>
        <div className="card">
          <div className="cardTitle">Current Market</div>
          <div className="cardValue" style={{ fontSize: "0.875rem", wordBreak: "break-all" }}>
            {state?.currentSlug || state?.conditionId || "—"}
          </div>
        </div>
      </div>

      <div style={{ marginBottom: "var(--space-lg)" }}>
        <ImpulseChart
          upHistory={state?.priceHistory?.up ?? []}
          downHistory={state?.priceHistory?.down ?? []}
          limitPrice={config?.limitPrice}
          upPrice={chartUpPrice}
          downPrice={chartDownPrice}
          marketStartTime={state?.marketStartTime ?? null}
          marketEndTime={state?.marketEndTime ?? null}
          impulseEvents={state?.impulseEvents ?? []}
          wsConnected={wsConnected}
        />
      </div>

      <h2 className="sectionTitle">Buy History</h2>
      {buys.length === 0 ? (
        <div className="tableWrap">
          <div className="loading">No buys yet</div>
        </div>
      ) : (
        <div className="tableWrap">
          <table className="table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Side</th>
                <th>Type</th>
                <th>Price</th>
                <th>Amount</th>
                <th>Shares</th>
              </tr>
            </thead>
            <tbody>
              {buys.map((b, i) => (
                <tr key={i}>
                  <td>{new Date(b.boughtAt * 1000).toLocaleString()}</td>
                  <td>{b.side}</td>
                  <td>{b.type}</td>
                  <td>{b.price.toFixed(3)}</td>
                  <td>${b.amountUsd.toFixed(2)}</td>
                  <td>{b.shares.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ marginTop: "var(--space-md)" }}>
        <button type="button" className="btn" onClick={load}>
          Refresh
        </button>
      </div>
    </>
  );
}

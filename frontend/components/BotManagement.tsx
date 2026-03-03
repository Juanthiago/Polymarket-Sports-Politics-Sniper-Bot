"use client";

import { useState, useEffect, useCallback } from "react";

interface Config {
  slugPrefix: string;
  windowSeconds: number;
  limitPrice: number;
  minJump: number;
  lookbackSec: number;
  trailingStopPct: number;
  buyAmountUsd: number;
  pollIntervalMs: number;
}

const DEFAULT_CONFIG: Config = {
  slugPrefix: "",
  windowSeconds: 900,
  limitPrice: 0.55,
  minJump: 0.05,
  lookbackSec: 60,
  trailingStopPct: 5,
  buyAmountUsd: 10,
  pollIntervalMs: 2000,
};

export function BotManagement() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [config, setConfig] = useState<Config>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [enabledRes, configRes] = await Promise.all([
        fetch("/api/bot-enabled"),
        fetch("/api/bot-config"),
      ]);
      const enabledData = await enabledRes.json();
      const configData = await configRes.json();
      setEnabled(enabledData.enabled ?? false);
      setConfig(configData.config ? { ...DEFAULT_CONFIG, ...configData.config } : DEFAULT_CONFIG);
    } catch (err) {
      setMessage("Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleToggle = async () => {
    if (enabled === null) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/bot-toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !enabled }),
      });
      const data = await res.json();
      if (data.ok) {
        setEnabled(data.enabled);
        setMessage(data.enabled ? "Bot enabled" : "Bot disabled");
      } else {
        setMessage(data.error || "Failed");
      }
    } catch (err) {
      setMessage("Request failed");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveConfig = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/bot-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (data.ok) {
        setMessage("Config saved");
      } else {
        setMessage(data.error || "Failed");
      }
    } catch (err) {
      setMessage("Request failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="loading">Loading…</div>;

  return (
    <div className="card">
      <div className="sectionTitle">Bot Control</div>
      <div style={{ display: "flex", gap: "var(--space-md)", alignItems: "center", marginBottom: "var(--space-lg)" }}>
        <button
          type="button"
          className="btn"
          onClick={handleToggle}
          disabled={saving}
        >
          {enabled ? "Disable Bot" : "Enable Bot"}
        </button>
        <span className={`badge ${enabled ? "badgeActive" : "badgeInactive"}`}>
          {enabled ? "Running" : "Stopped"}
        </span>
        {message && <span style={{ color: "var(--text-secondary)" }}>{message}</span>}
      </div>

      <div className="sectionTitle">Config</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "var(--space-md)" }}>
        <div className="formGroup">
          <label>Slug Prefix</label>
          <input
            value={config.slugPrefix}
            onChange={(e) => setConfig((c) => ({ ...c, slugPrefix: e.target.value }))}
            placeholder="e.g. btc-updown-15m"
          />
        </div>
        <div className="formGroup">
          <label>Window (sec)</label>
          <input
            type="number"
            value={config.windowSeconds}
            onChange={(e) => setConfig((c) => ({ ...c, windowSeconds: parseInt(e.target.value, 10) || 900 }))}
            placeholder="900 for 15m"
          />
        </div>
        <div className="formGroup">
          <label>Limit Price</label>
          <input
            type="number"
            step="0.01"
            value={config.limitPrice}
            onChange={(e) => setConfig((c) => ({ ...c, limitPrice: parseFloat(e.target.value) || 0.55 }))}
          />
        </div>
        <div className="formGroup">
          <label>Min Jump</label>
          <input
            type="number"
            step="0.01"
            value={config.minJump}
            onChange={(e) => setConfig((c) => ({ ...c, minJump: parseFloat(e.target.value) || 0.05 }))}
          />
        </div>
        <div className="formGroup">
          <label>Lookback (sec)</label>
          <input
            type="number"
            value={config.lookbackSec}
            onChange={(e) => setConfig((c) => ({ ...c, lookbackSec: parseInt(e.target.value, 10) || 60 }))}
          />
        </div>
        <div className="formGroup">
          <label>Trailing Stop %</label>
          <input
            type="number"
            value={config.trailingStopPct}
            onChange={(e) => setConfig((c) => ({ ...c, trailingStopPct: parseFloat(e.target.value) || 5 }))}
          />
        </div>
        <div className="formGroup">
          <label>Buy Amount (USD)</label>
          <input
            type="number"
            value={config.buyAmountUsd}
            onChange={(e) => setConfig((c) => ({ ...c, buyAmountUsd: parseFloat(e.target.value) || 10 }))}
          />
        </div>
        <div className="formGroup">
          <label>Poll Interval (ms)</label>
          <input
            type="number"
            value={config.pollIntervalMs}
            onChange={(e) => setConfig((c) => ({ ...c, pollIntervalMs: parseInt(e.target.value, 10) || 2000 }))}
          />
        </div>
      </div>
      <button type="button" className="btn" onClick={handleSaveConfig} disabled={saving} style={{ marginTop: "var(--space-md)" }}>
        Save Config
      </button>
    </div>
  );
}

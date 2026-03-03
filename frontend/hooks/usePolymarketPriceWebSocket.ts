"use client";

import { useState, useEffect, useRef } from "react";

const CLOB_WS_URL = "wss://ws-subscriptions-clob.polymarket.com/ws/market";

function midFromBidAsk(bid: string | number, ask: string | number): number | null {
  const b = typeof bid === "string" ? parseFloat(bid) : bid;
  const a = typeof ask === "string" ? parseFloat(ask) : ask;
  let mid: number | null = null;
  if (Number.isFinite(b) && Number.isFinite(a)) mid = (b + a) / 2;
  else if (Number.isFinite(a)) mid = a;
  else if (Number.isFinite(b)) mid = b;
  if (mid != null && mid >= 0 && mid <= 1) return mid;
  return null;
}

export function usePolymarketPriceWebSocket(
  upTokenId: string | null,
  downTokenId: string | null
): {
  liveUpPrice: number | null;
  liveDownPrice: number | null;
  wsConnected: boolean;
} {
  const [liveUpPrice, setLiveUpPrice] = useState<number | null>(null);
  const [liveDownPrice, setLiveDownPrice] = useState<number | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!upTokenId || !downTokenId) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
        setWsConnected(false);
        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = null;
        }
      }
      setLiveUpPrice(null);
      setLiveDownPrice(null);
      return;
    }

    const assetIds = [upTokenId, downTokenId];
    const ws = new WebSocket(CLOB_WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsConnected(true);
      ws.send(
        JSON.stringify({
          assets_ids: assetIds,
          type: "market",
          custom_feature_enabled: true,
        })
      );
      pingIntervalRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "ping" }));
      }, 10000);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "pong") return;

        const eventType = data.event_type;
        const aid = data.asset_id != null ? String(data.asset_id) : null;

        if (eventType === "book" && aid) {
          const bids = data.bids || [];
          const asks = data.asks || [];
          const bestBid = bids[0]?.price;
          const bestAsk = asks[0]?.price;
          const mid = midFromBidAsk(bestBid ?? 0, bestAsk ?? 0);
          if (mid != null) {
            if (aid === String(upTokenId)) setLiveUpPrice(mid);
            else if (aid === String(downTokenId)) setLiveDownPrice(mid);
          }
        } else if (eventType === "best_bid_ask" && aid) {
          const mid = midFromBidAsk(data.best_bid ?? 0, data.best_ask ?? 0);
          if (mid != null) {
            if (aid === String(upTokenId)) setLiveUpPrice(mid);
            else if (aid === String(downTokenId)) setLiveDownPrice(mid);
          }
        } else if (eventType === "price_change" && Array.isArray(data.price_changes)) {
          for (const pc of data.price_changes) {
            const mid = midFromBidAsk(pc.best_bid ?? 0, pc.best_ask ?? 0);
            const pcAid = pc.asset_id != null ? String(pc.asset_id) : null;
            if (mid != null && pcAid) {
              if (pcAid === String(upTokenId)) setLiveUpPrice(mid);
              else if (pcAid === String(downTokenId)) setLiveDownPrice(mid);
            }
          }
        }
      } catch (_) {}
    };

    ws.onclose = () => {
      setWsConnected(false);
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
    };

    ws.onerror = () => {
      setWsConnected(false);
    };

    return () => {
      ws.close();
      wsRef.current = null;
      setWsConnected(false);
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
      setLiveUpPrice(null);
      setLiveDownPrice(null);
    };
  }, [upTokenId, downTokenId]);

  return { liveUpPrice, liveDownPrice, wsConnected };
}

"use client";

import { BotManagement } from "@/components/BotManagement";

export default function SettingsPage() {
  return (
    <>
      <h1 className="sectionTitle">Bot Settings</h1>
      <p style={{ color: "var(--text-secondary)", marginBottom: "var(--space-lg)" }}>
        Enable/disable the bot and configure impulse detection parameters. Config is stored in Redis
        and applied by the backend on the next poll.
      </p>
      <BotManagement />
    </>
  );
}

import React from "react";
import { Box, Text } from "ink";
import type { RuntimeHealth } from "@open-lagrange/core/interface";
import { theme } from "../theme.js";

export function StatusBar({ health, width }: { readonly health: RuntimeHealth; readonly width: number }): React.ReactElement {
  const compact = width < 96;
  const auth = health.remote_auth ?? "missing";
  const secrets = health.secret_provider ?? "env";
  const packIssues = (health.pack_health ?? []).filter((pack) => pack.status !== "healthy").length;
  return (
    <Box borderStyle="single" borderColor={theme.border} paddingX={1} width={width}>
      <Segment label="Profile" value={health.profile} valueColor={theme.accent} />
      <Segment label="API" value={health.api} valueColor={serviceColor(health.api)} />
      <Segment label="Worker" value={health.worker} valueColor={serviceColor(health.worker)} />
      <Segment label="Hatchet" value={health.hatchet} valueColor={serviceColor(health.hatchet)} />
      <Segment label="Packs" value={packIssues > 0 ? `${health.packs}/${packIssues} issues` : String(health.packs)} valueColor={packIssues > 0 ? theme.warn : theme.accent} />
      <Segment label="Model" value={compact ? short(health.model) : health.model} valueColor={configuredColor(health.model)} />
      <Segment label="Auth" value={compact ? short(auth) : auth} valueColor={configuredColor(auth)} />
      <Segment label="Secrets" value={compact ? short(secrets) : secrets} valueColor={theme.accent} />
    </Box>
  );
}

function Segment({ label, value, valueColor }: { readonly label: string; readonly value: string; readonly valueColor: string }): React.ReactElement {
  return (
    <Text>
      <Text color={theme.title}>{label}:</Text>
      <Text color={valueColor}> {value}</Text>
      <Text>  </Text>
    </Text>
  );
}

function serviceColor(value: string): string {
  if (value === "up" || value === "local") return theme.ok;
  if (value === "down") return theme.error;
  return theme.warn;
}

function configuredColor(value: string): string {
  return value === "configured" ? theme.ok : theme.warn;
}

function short(value: string): string {
  if (value === "configured") return "ok";
  if (value === "not_configured") return "missing";
  if (value.length <= 14) return value;
  return `${value.slice(0, 11)}...`;
}

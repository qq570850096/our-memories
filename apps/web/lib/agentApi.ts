import { apiJson } from "@/lib/apiClient";

export type AgentSettings = {
  enabled: boolean;
};

export type IgnoredAgentSuggestion = {
  agent: string;
  targetId: string;
  reason?: string;
  ignoredAt: string;
};

export type AgentSettingsResponse = {
  settings: AgentSettings;
  ignored: IgnoredAgentSuggestion[];
};

export function getAgentSettings() {
  return apiJson<AgentSettingsResponse>("/api/v1/agent/settings");
}

export function updateAgentSettings(settings: AgentSettings) {
  return apiJson<{ settings: AgentSettings }>("/api/v1/agent/settings", {
    method: "PATCH",
    body: JSON.stringify(settings),
  });
}

export function ignoreAgentSuggestion(agent: string, targetId: string, reason?: string) {
  return apiJson<{ ignored: IgnoredAgentSuggestion[] }>("/api/v1/agent/ignored", {
    method: "POST",
    body: JSON.stringify({ agent, targetId, reason }),
  });
}

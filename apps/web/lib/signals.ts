import { apiJson } from "@/lib/apiClient";

export type RelationshipSignal = {
  id: string;
  spaceId: string;
  senderUserId: string;
  cityId: string;
  message: string;
  createdAt: string;
  expiresAt: string;
};

export async function fetchSignals() {
  const response = await apiJson<{ signals: RelationshipSignal[] }>("/signals");
  return response.signals ?? [];
}

export async function createSignal(cityId: string, message = "") {
  return apiJson<{ id: string }>("/signals", {
    method: "POST",
    body: JSON.stringify({ cityId, message }),
  });
}

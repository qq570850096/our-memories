import type { Memory } from "@/data/memories";
import type { LocalMemoryStore } from "@/data/progress";
import { apiFetch } from "@/lib/apiClient";
import { memoryPhotosPayload, type PhotoPayload } from "@/lib/photoPayload";

export type MemoryPhotoPayload = PhotoPayload;

export type MemoryPatchPayload = Omit<Partial<Memory>, "photos"> & {
  coverImage?: string;
  photos?: MemoryPhotoPayload[];
};

export type MemoryMutationResponse = {
  memory?: Memory;
  memories: LocalMemoryStore;
};

export type MemoryListFilters = {
  cursor?: string;
  limit?: number;
  cityId?: string;
  tags?: string[];
  mood?: string;
  visibility?: string;
  dateFrom?: string;
  dateTo?: string;
  q?: string;
};

export type MemoryListPage = {
  items: Memory[];
  nextCursor?: string;
  hasMore: boolean;
};

export type MemorySearchIntent = {
  query?: string;
  cityId?: string;
  tags?: string[];
  mood?: string;
  source?: Record<string, string>;
};

export type MemoryIntentSearchResult = MemoryListPage & {
  intent: MemorySearchIntent;
};

type ApiMemoryPhoto = string | {
  url?: string;
  mimeType?: string;
  mediaType?: string;
};

type ApiMemory = Omit<Memory, "image" | "photos"> & {
  image?: string;
  photos?: ApiMemoryPhoto[];
};

function memoryListSearchParams(filters: MemoryListFilters) {
  const params = new URLSearchParams();
  params.set("limit", String(filters.limit ?? 20));
  if (filters.cursor) params.set("cursor", filters.cursor);
  if (filters.cityId) params.set("cityId", filters.cityId);
  if (filters.tags?.length) params.set("tags", filters.tags.join(","));
  if (filters.mood) params.set("mood", filters.mood);
  if (filters.visibility) params.set("visibility", filters.visibility);
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  if (filters.q) params.set("q", filters.q);
  return params;
}

function normalizeApiMemory(memory: ApiMemory): Memory {
  const photos = (memory.photos ?? []).flatMap((photo) => {
    if (typeof photo === "string") return photo ? [photo] : [];
    const mediaType = photo.mediaType?.toLowerCase();
    const mimeType = photo.mimeType?.toLowerCase();
    if (mediaType === "audio" || mimeType?.startsWith("audio/")) return [];
    return photo.url ? [photo.url] : [];
  });

  return {
    ...memory,
    image: memory.image || photos[0] || "",
    photos,
  };
}

export async function listMemories(filters: MemoryListFilters = {}): Promise<MemoryListPage> {
  const params = memoryListSearchParams(filters);
  const path = filters.q ? `/api/v1/memories/search?${params}` : `/api/v1/memories?${params}`;
  const response = await apiFetch(path);
  if (!response.ok) throw new Error("Failed to fetch memories");
  const page = (await response.json()) as Omit<MemoryListPage, "items"> & { items: ApiMemory[] };
  return { ...page, items: page.items.map(normalizeApiMemory) };
}

export async function relatedMemories(memoryId: string): Promise<Memory[]> {
  const response = await apiFetch(`/api/v1/memories/${memoryId}/related`);
  if (!response.ok) throw new Error("Failed to fetch related memories");
  const data = (await response.json()) as { items?: ApiMemory[] };
  return (data.items ?? []).map(normalizeApiMemory);
}

export async function searchMemoriesByIntent(q: string, limit = 20): Promise<MemoryIntentSearchResult> {
  const response = await apiFetch("/api/v1/ai/memory-search", {
    method: "POST",
    body: JSON.stringify({ q, limit }),
  });
  if (!response.ok) throw new Error("Failed to search memories by intent");
  const data = (await response.json()) as Omit<MemoryIntentSearchResult, "items"> & { items: ApiMemory[] };
  return { ...data, items: data.items.map(normalizeApiMemory) };
}

export async function createMemory(
  memory: Memory,
  photos?: MemoryPhotoPayload[],
): Promise<MemoryMutationResponse> {
  const response = await apiFetch("/api/v1/memories", {
    method: "POST",
    body: JSON.stringify({
      ...memory,
      photos: photos ?? memoryPhotosPayload(memory.photos ?? [memory.image]),
    }),
  });

  if (!response.ok) throw new Error("Failed to save memory");
  return (await response.json()) as MemoryMutationResponse;
}

export async function updateMemory(
  memoryId: string,
  patch: MemoryPatchPayload,
): Promise<MemoryMutationResponse> {
  const response = await apiFetch(`/memories/${memoryId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });

  if (!response.ok) throw new Error("Failed to update memory");
  return (await response.json()) as MemoryMutationResponse;
}

export async function setMemoryCover(
  memoryId: string,
  coverImage: string,
): Promise<MemoryMutationResponse> {
  return updateMemory(memoryId, { coverImage });
}

export async function deleteMemory(memoryId: string): Promise<MemoryMutationResponse> {
  const response = await apiFetch(`/memories/${memoryId}`, {
    method: "DELETE",
  });

  if (!response.ok) throw new Error("Failed to delete memory");
  return (await response.json()) as MemoryMutationResponse;
}

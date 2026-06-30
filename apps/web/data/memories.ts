export interface Memory {
  id: string;
  cityId: string;
  city: string;
  cityEn: string;
  title?: string;
  date: string;
  image: string;
  photos?: string[];
  text: string;
  mood?: string;
  tags?: string[];
  visibility?: "both" | "me" | "her";
  partnerNote?: string;
  partnerNoteAuthorId?: string;
  voiceTextUrl?: string;
  partnerVoiceUrl?: string;
  placeName?: string;
  createdById?: string;
  createdAt?: string;
  updatedAt?: string;
  draft?: boolean;
  pending?: boolean;
}

export interface MemorySummaryItem {
  cityId: string;
  city: string;
  cityEn: string;
  count: number;
  coverImage?: string;
  latest?: Memory;
  updatedAt?: string;
}

export type MemorySummaryStore = Record<string, MemorySummaryItem>;

export const memoryTime = (memory: Pick<Memory, "date" | "createdAt">) => {
  if (/^\d{4}\.\d{2}\.\d{2}$/.test(memory.date)) {
    const [year, month, day] = memory.date.split(".").map(Number);

    return Date.UTC(year, month - 1, day);
  }

  return memory.createdAt ? new Date(memory.createdAt).getTime() : 0;
};

export const sortMemoriesByTime = <T extends Pick<Memory, "date" | "createdAt">>(items: T[]) =>
  [...items].sort((a, b) => memoryTime(b) - memoryTime(a));

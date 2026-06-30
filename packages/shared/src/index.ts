import { z } from "zod";

export const spaceRoles = ["owner", "member"] as const;
export const draftStatuses = ["draft", "accepted", "rejected"] as const;
export const auxiliaryKinds = ["favorite", "anniversary", "capsule"] as const;
export const memoryVisibilities = ["both", "me", "her"] as const;
export const activationCodeStatuses = ["active", "used", "revoked"] as const;
export const orderStatuses = ["pending", "paid", "fulfilled", "canceled"] as const;

export type SpaceRole = (typeof spaceRoles)[number];
export type DraftStatus = (typeof draftStatuses)[number];
export type AuxiliaryKind = (typeof auxiliaryKinds)[number];
export type MemoryVisibility = (typeof memoryVisibilities)[number];
export type ActivationCodeStatus = (typeof activationCodeStatuses)[number];
export type OrderStatus = (typeof orderStatuses)[number];

export const memoryPhotoSchema = z.object({
  id: z.string(),
  url: z.string(),
  key: z.string().optional(),
  mimeType: z.string().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  sortOrder: z.number().int().default(0),
});

export const memorySchema = z.object({
  id: z.string(),
  cityId: z.string(),
  city: z.string(),
  cityEn: z.string(),
  title: z.string().optional(),
  date: z.string(),
  text: z.string(),
  mood: z.string().optional(),
  tags: z.array(z.string()).default([]),
  visibility: z.enum(memoryVisibilities).default("both"),
  partnerNote: z.string().optional(),
  partnerVoiceUrl: z.string().optional(),
  voiceTextUrl: z.string().optional(),
  placeName: z.string().optional(),
  image: z.string(),
  photos: z.array(z.string()).default([]),
  photoItems: z.array(memoryPhotoSchema).default([]),
  createdById: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  draft: z.boolean().optional(),
});

export const appSettingsSchema = z.object({
  loginPhotos: z.record(z.string(), z.string()).optional(),
  loginPhotoTexts: z
    .record(
      z.string(),
      z.object({
        city: z.string().optional(),
        label: z.string().optional(),
      }),
    )
    .optional(),
  anniversaryDate: z.string().optional(),
  anniversaryLabel: z.string().optional(),
  weatherCityIds: z.array(z.string()).optional(),
  coupleLogo: z.string().optional(),
});

export const cityAssetSchema = z.object({
  cityId: z.string(),
  image: z.string(),
});

export const auxiliaryItemSchema = z.object({
  id: z.string(),
  kind: z.enum(auxiliaryKinds),
  title: z.string(),
  date: z.string().optional(),
  note: z.string().default(""),
  cityId: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export const loginPayloadSchema = z.object({
  username: z.string().min(1).max(120),
  password: z.string().min(1).max(200),
  spaceSlug: z.string().min(1).max(120).optional(),
});

export const memoryUpsertPayloadSchema = z.object({
  memory: memorySchema
    .partial({
      id: true,
      city: true,
      cityEn: true,
      image: true,
      photos: true,
      photoItems: true,
      createdAt: true,
      updatedAt: true,
    })
    .extend({
      cityId: z.string().min(1),
      date: z.string().min(1),
      title: z.string().max(120).optional(),
      text: z.string().min(1).max(500),
      mood: z.string().max(40).optional(),
      tags: z.array(z.string().min(1).max(24)).max(12).optional(),
      visibility: z.enum(memoryVisibilities).optional(),
      partnerNote: z.string().max(500).optional(),
      placeName: z.string().max(120).optional(),
      image: z.string().optional(),
      photos: z.array(z.string()).optional(),
    }),
});

export const anniversaryPhotoSchema = z.object({
  id: z.string(),
  url: z.string(),
  key: z.string().optional(),
  mimeType: z.string().optional(),
  sortOrder: z.number().int().default(0),
});

export const anniversaryCardSchema = z.object({
  id: z.string(),
  title: z.string(),
  date: z.string(),
  note: z.string().default(""),
  voiceUrl: z.string().optional(),
  bgmUrl: z.string().optional(),
  bgmPreset: z.string().optional(),
  image: z.string().optional(),
  photos: z.array(z.string()).default([]),
  photoItems: z.array(anniversaryPhotoSchema).default([]),
  repeatYearly: z.boolean().default(true),
  pinned: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
  createdById: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export const anniversaryCardUpsertPayloadSchema = z.object({
  card: anniversaryCardSchema
    .partial({
      id: true,
      image: true,
      photos: true,
      photoItems: true,
      note: true,
      repeatYearly: true,
      pinned: true,
      sortOrder: true,
      createdById: true,
      createdAt: true,
      updatedAt: true,
    })
    .extend({
      title: z.string().min(1).max(120),
      date: z.string().min(1),
      note: z.string().max(500).optional(),
      bgmUrl: z.string().optional(),
      bgmPreset: z.string().optional(),
      photos: z.array(z.string()).optional(),
      repeatYearly: z.boolean().optional(),
      pinned: z.boolean().optional(),
      sortOrder: z.number().int().optional(),
    }),
});

export const activationCodeClaimPayloadSchema = z.object({
  code: z.string().min(4).max(80),
  spaceName: z.string().min(1).max(80),
  accounts: z
    .tuple([
      z.object({
        username: z.string().min(1).max(40),
        displayName: z.string().min(1).max(80).optional(),
        password: z.string().regex(/^\d{4}$/),
      }),
      z.object({
        username: z.string().min(1).max(40),
        displayName: z.string().min(1).max(80).optional(),
        password: z.string().regex(/^\d{4}$/),
      }),
    ])
    .refine(([first, second]) => first.username.trim() !== second.username.trim(), {
      message: "Account usernames must be different",
    }),
});

export const memoryDraftSchema = z.object({
  id: z.string(),
  status: z.enum(draftStatuses),
  cityId: z.string().optional(),
  date: z.string().optional(),
  title: z.string().optional(),
  text: z.string(),
  tags: z.array(z.string()).default([]),
  sourceText: z.string().optional(),
  createdAt: z.string().optional(),
});

export const tripPlanDraftSchema = z.object({
  id: z.string(),
  status: z.enum(draftStatuses),
  title: z.string(),
  origin: z.string().optional(),
  destination: z.string().optional(),
  destinationCityIds: z.array(z.string()).default([]),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  summary: z.string(),
  checkpoints: z.array(z.string()).default([]),
  transportNotes: z.array(z.string()).default([]),
  createdAt: z.string().optional(),
});

export const tripGuideCheckpointSchema = z.object({
  name: z.string().default(""),
  city: z.string().optional(),
  reason: z.string().default(""),
  suggestedDuration: z.string().optional(),
  tips: z.string().optional(),
});

export const tripGuideDaySchema = z.object({
  day: z.number().int().positive(),
  title: z.string().default(""),
  theme: z.string().default(""),
  morning: z.array(z.string()).default([]),
  afternoon: z.array(z.string()).default([]),
  evening: z.array(z.string()).default([]),
  checkpoints: z.array(tripGuideCheckpointSchema).default([]),
  food: z.array(z.string()).default([]),
  notes: z.string().optional(),
});

export const tripGuidePayloadSchema = z.object({
  title: z.string().min(1).default("旅行攻略"),
  origin: z.string().default(""),
  destination: z.string().default(""),
  days: z.number().int().positive().max(30).default(3),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  travelStyle: z.enum(["relaxed", "balanced", "packed"]).default("balanced"),
  transport: z
    .object({
      summary: z.string().default(""),
      outbound: z.array(z.string()).default([]),
      returnTrip: z.array(z.string()).default([]),
      local: z.array(z.string()).default([]),
      warnings: z.array(z.string()).default([]),
    })
    .default({ summary: "", outbound: [], returnTrip: [], local: [], warnings: [] }),
  daysPlan: z.array(tripGuideDaySchema).default([]),
  budgetNotes: z.array(z.string()).default([]),
  packingNotes: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  markdown: z.string().default(""),
});

export const tripGuideSchema = z.object({
  id: z.string(),
  status: z.enum(draftStatuses).optional(),
  payload: tripGuidePayloadSchema,
  source: z.unknown().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export const tripGuideJobQuestionSchema = z.object({
  id: z.string(),
  question: z.string(),
  options: z.array(z.string()).min(1).max(5),
});

export const tripGuideJobSchema = z.object({
  id: z.string(),
  status: z.enum(["queued", "running", "needs_confirmation", "completed", "failed"]),
  input: z.unknown(),
  result: z.unknown().optional(),
  error: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export type MemoryPhoto = z.infer<typeof memoryPhotoSchema>;
export type Memory = z.infer<typeof memorySchema>;
export type AnniversaryPhoto = z.infer<typeof anniversaryPhotoSchema>;
export type AnniversaryCard = z.infer<typeof anniversaryCardSchema>;
export type AppSettings = z.infer<typeof appSettingsSchema>;
export type CityAsset = z.infer<typeof cityAssetSchema>;
export type AuxiliaryItem = z.infer<typeof auxiliaryItemSchema>;
export type LoginPayload = z.infer<typeof loginPayloadSchema>;
export type ActivationCodeClaimPayload = z.infer<typeof activationCodeClaimPayloadSchema>;
export type MemoryDraft = z.infer<typeof memoryDraftSchema>;
export type TripPlanDraft = z.infer<typeof tripPlanDraftSchema>;
export type TripGuideCheckpoint = z.infer<typeof tripGuideCheckpointSchema>;
export type TripGuideDay = z.infer<typeof tripGuideDaySchema>;
export type TripGuidePayload = z.infer<typeof tripGuidePayloadSchema>;
export type TripGuide = z.infer<typeof tripGuideSchema>;
export type TripGuideJobQuestion = z.infer<typeof tripGuideJobQuestionSchema>;
export type TripGuideJob = z.infer<typeof tripGuideJobSchema>;

export type LocalMemoryStore = Record<string, Memory[]>;
export type CityAssetStore = Record<string, string>;
export type LoginPhotoStore = {
  photos: Record<string, string>;
  texts: Record<string, { city?: string; label?: string }>;
};

export const toIsoString = (value: Date | string | null | undefined) => {
  if (!value) return undefined;
  return value instanceof Date ? value.toISOString() : value;
};

export const parseDottedDate = (value: string) => {
  const match = /^(\d{4})\.(\d{1,2})\.(\d{1,2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day, date };
};

export const normalizeDottedDate = (value: string) => {
  const parsed = parseDottedDate(value);
  if (!parsed) return null;
  return `${parsed.year}.${String(parsed.month).padStart(2, "0")}.${String(parsed.day).padStart(2, "0")}`;
};

export const startOfUtcToday = (now = new Date()) =>
  Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

export const daysSince = (date: string, now = new Date()) => {
  const parsed = parseDottedDate(date);
  if (!parsed) return null;
  return Math.floor((startOfUtcToday(now) - parsed.date.getTime()) / 86_400_000);
};

export const daysUntilNext = (date: string, repeatYearly = false, now = new Date()) => {
  const parsed = parseDottedDate(date);
  if (!parsed) return null;
  const today = startOfUtcToday(now);
  let target = Date.UTC(parsed.year, parsed.month - 1, parsed.day);

  if (repeatYearly) {
    const currentYear = now.getUTCFullYear();
    target = Date.UTC(currentYear, parsed.month - 1, parsed.day);
    if (target < today) target = Date.UTC(currentYear + 1, parsed.month - 1, parsed.day);
  }

  return Math.ceil((target - today) / 86_400_000);
};

export const anniversaryDisplayState = (
  card: Pick<AnniversaryCard, "date" | "repeatYearly">,
  now = new Date(),
) => {
  const since = daysSince(card.date, now);
  const until = daysUntilNext(card.date, card.repeatYearly, now);
  if (since === null || until === null) return { valid: false as const };

  return {
    valid: true as const,
    daysSince: since,
    daysUntil: until,
    label: until === 0 ? "今天" : until > 0 ? `还有 ${until} 天` : `已经 ${Math.abs(until)} 天`,
    sinceLabel: since >= 0 ? `已经 ${since} 天` : `还有 ${Math.abs(since)} 天`,
  };
};

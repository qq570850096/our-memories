import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import { auxiliaryKinds } from "@map-of-us/shared";
import { requireAuth } from "../auth.js";
import { cityInfo } from "../cities.js";
import { prisma } from "../prisma.js";
import { memoryStore, serializeMemory } from "../serializers.js";
import { storeImage } from "../storage.js";
import type { AuthenticatedRequest } from "../types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const auxiliaryBackupSources = [
  { key: "mapofus:favorites", kind: "favorite" },
  { key: "mapofus:anniversaries", kind: "anniversary" },
  { key: "mapofus:capsules", kind: "capsule" },
] as const;

function auxiliaryCreateData(spaceId: string, entry: Record<string, unknown>, kind: (typeof auxiliaryKinds)[number]) {
  return {
    spaceId,
    kind,
    title: typeof entry.title === "string" ? entry.title : "",
    date: typeof entry.date === "string" ? entry.date : null,
    note: typeof entry.note === "string" ? entry.note : "",
    cityId: typeof entry.cityId === "string" ? entry.cityId : null,
  };
}

export async function registerBackupRoutes(app: FastifyInstance) {
  app.post("/backup/import", { preHandler: requireAuth }, async (request, reply) => {
    const auth = (request as AuthenticatedRequest).auth;
    const payload = request.body as unknown;
    if (!isRecord(payload)) return reply.code(400).send({ error: "Invalid backup payload" });

    if (isRecord(payload.memories)) {
      await prisma.memory.deleteMany({ where: { spaceId: auth.spaceId } });
      for (const [cityId, value] of Object.entries(payload.memories)) {
        const entries = Array.isArray(value) ? value : [value];
        for (const entry of entries) {
          if (!isRecord(entry)) continue;
          const info = cityInfo(cityId, {
            name: typeof entry.city === "string" ? entry.city : undefined,
            nameEn: typeof entry.cityEn === "string" ? entry.cityEn : undefined,
          });
          const memory = await prisma.memory.create({
            data: {
              spaceId: auth.spaceId,
              createdById: auth.userId,
              cityId: info.id,
              city: info.name,
              cityEn: info.nameEn,
              title: typeof entry.title === "string" ? entry.title : null,
              date: typeof entry.date === "string" ? entry.date : "待添加日期",
              text: typeof entry.text === "string" ? entry.text : "",
              mood: typeof entry.mood === "string" ? entry.mood : null,
              tags: Array.isArray(entry.tags)
                ? entry.tags.filter((tag): tag is string => typeof tag === "string").slice(0, 12)
                : [],
              visibility:
                entry.visibility === "me" || entry.visibility === "her" || entry.visibility === "both"
                  ? entry.visibility
                  : "both",
              partnerNote: typeof entry.partnerNote === "string" ? entry.partnerNote : null,
              placeName: typeof entry.placeName === "string" ? entry.placeName : null,
            },
          });
          const photos = Array.isArray(entry.photos)
            ? entry.photos.filter((photo): photo is string => typeof photo === "string")
            : typeof entry.image === "string"
              ? [entry.image]
              : [];
          const created = await Promise.all(
            photos.map(async (photo, index) => {
              const stored = await storeImage(auth.spaceId, `memories/${memory.id}`, photo);
              return prisma.memoryPhoto.create({
                data: {
                  memoryId: memory.id,
                  key: stored.key,
                  url: stored.url,
                  mimeType: stored.mimeType,
                  sortOrder: index,
                },
              });
            }),
          );
          if (created[0]) {
            await prisma.memory.update({ where: { id: memory.id }, data: { coverPhotoId: created[0].id } });
          }
        }
      }
    }

    if (isRecord(payload.settings)) {
      await prisma.setting.upsert({
        where: { spaceId_key: { spaceId: auth.spaceId, key: "app" } },
        create: { spaceId: auth.spaceId, key: "app", value: payload.settings as Prisma.InputJsonValue },
        update: { value: payload.settings as Prisma.InputJsonValue },
      });
    }

    if (isRecord(payload.cityAssets)) {
      await Promise.all(
        Object.entries(payload.cityAssets).flatMap(([cityId, image]) =>
          typeof image === "string"
            ? [
                storeImage(auth.spaceId, `city-assets/${cityId}`, image).then((stored) =>
                  prisma.cityAsset.upsert({
                    where: { spaceId_cityId: { spaceId: auth.spaceId, cityId } },
                    create: {
                      spaceId: auth.spaceId,
                      cityId,
                      key: stored.key,
                      url: stored.url,
                      mimeType: stored.mimeType,
                    },
                    update: { key: stored.key, url: stored.url, mimeType: stored.mimeType },
                  }),
                ),
              ]
            : [],
        ),
      );
    }

    if (isRecord(payload.auxiliary)) {
      await prisma.auxiliaryItem.deleteMany({ where: { spaceId: auth.spaceId } });

      for (const source of auxiliaryBackupSources) {
        const entries = payload.auxiliary[source.key];
        if (!Array.isArray(entries)) continue;

        for (const entry of entries) {
          if (!isRecord(entry) || typeof entry.title !== "string") continue;
          const data = auxiliaryCreateData(auth.spaceId, entry, source.kind);
          const id = typeof entry.id === "string" && entry.id.trim().length > 0 ? entry.id : undefined;

          await prisma.auxiliaryItem.create({
            data: {
              ...(id ? { id } : {}),
              ...data,
            },
          }).catch(() => prisma.auxiliaryItem.create({ data }));
        }
      }
    }

    const memories = await prisma.memory.findMany({
      where: { spaceId: auth.spaceId },
      include: { photos: true },
      orderBy: { createdAt: "desc" },
    });
    return { ok: true, memories: memoryStore(memories.map(serializeMemory)) };
  });
}

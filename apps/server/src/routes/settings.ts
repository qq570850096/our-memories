import type { FastifyInstance } from "fastify";
import { auxiliaryKinds } from "@map-of-us/shared";
import type { AuxiliaryItem } from "@prisma/client";
import { requireAuth } from "../auth.js";
import { prisma } from "../prisma.js";
import type { AuthenticatedRequest } from "../types.js";

const settingKey = "app";

const serializeAuxiliaryItem = (item: AuxiliaryItem) => ({
  id: item.id,
  kind: item.kind,
  title: item.title,
  date: item.date ?? undefined,
  note: item.note,
  cityId: item.cityId ?? undefined,
  createdAt: item.createdAt.toISOString(),
  updatedAt: item.updatedAt.toISOString(),
});

export async function registerSettingsRoutes(app: FastifyInstance) {
  app.get("/settings", { preHandler: requireAuth }, async (request) => {
    const auth = (request as AuthenticatedRequest).auth;
    const setting = await prisma.setting.findUnique({
      where: { spaceId_key: { spaceId: auth.spaceId, key: settingKey } },
    });
    return { settings: setting?.value ?? {} };
  });

  app.put("/settings", { preHandler: requireAuth }, async (request) => {
    const auth = (request as AuthenticatedRequest).auth;
    const value =
      request.body && typeof request.body === "object" && !Array.isArray(request.body)
        ? ((request.body as { settings?: unknown }).settings ?? request.body)
        : {};

    const setting = await prisma.setting.upsert({
      where: { spaceId_key: { spaceId: auth.spaceId, key: settingKey } },
      create: { spaceId: auth.spaceId, key: settingKey, value: value as object },
      update: { value: value as object },
    });
    return { settings: setting.value };
  });

  for (const kind of auxiliaryKinds) {
    app.get(`/${kind === "favorite" ? "favorites" : kind === "anniversary" ? "anniversaries" : "capsules"}`, {
      preHandler: requireAuth,
    }, async (request) => {
      const auth = (request as AuthenticatedRequest).auth;
      const items = await prisma.auxiliaryItem.findMany({
        where: { spaceId: auth.spaceId, kind },
        orderBy: { createdAt: "desc" },
      });
      return {
        items: items.map(serializeAuxiliaryItem),
      };
    });
  }

  app.get("/auxiliary-items", { preHandler: requireAuth }, async (request) => {
    const auth = (request as AuthenticatedRequest).auth;
    const items = await prisma.auxiliaryItem.findMany({
      where: { spaceId: auth.spaceId },
      orderBy: { createdAt: "desc" },
    });
    return { items: items.map(serializeAuxiliaryItem) };
  });

  app.put("/auxiliary-items", { preHandler: requireAuth }, async (request, reply) => {
    const auth = (request as AuthenticatedRequest).auth;
    const payload = request.body as {
      id?: unknown;
      kind?: unknown;
      title?: unknown;
      date?: unknown;
      note?: unknown;
      cityId?: unknown;
    } | null;

    if (
      !payload ||
      typeof payload.kind !== "string" ||
      !auxiliaryKinds.includes(payload.kind as never) ||
      typeof payload.title !== "string"
    ) {
      return reply.code(400).send({ error: "Invalid auxiliary item payload" });
    }

    const id = typeof payload.id === "string" && payload.id.trim().length > 0 ? payload.id : undefined;
    const data = {
      kind: payload.kind as never,
      title: payload.title,
      date: typeof payload.date === "string" ? payload.date : null,
      note: typeof payload.note === "string" ? payload.note : "",
      cityId: typeof payload.cityId === "string" ? payload.cityId : null,
    };
    const existing = id
      ? await prisma.auxiliaryItem.findFirst({ where: { id, spaceId: auth.spaceId } })
      : null;

    const item = existing
      ? await prisma.auxiliaryItem.update({
          where: { id: existing.id },
          data,
        })
      : await prisma.auxiliaryItem.create({
          data: {
            ...(id ? { id } : {}),
            spaceId: auth.spaceId,
            ...data,
          },
        }).catch(() =>
          prisma.auxiliaryItem.create({
            data: {
              spaceId: auth.spaceId,
              ...data,
            },
          }),
        );

    return { item: serializeAuxiliaryItem(item) };
  });

  app.delete("/auxiliary-items/:id", { preHandler: requireAuth }, async (request, reply) => {
    const auth = (request as AuthenticatedRequest).auth;
    const { id } = request.params as { id: string };
    await prisma.auxiliaryItem.deleteMany({ where: { id, spaceId: auth.spaceId } });
    return { ok: true };
  });
}

import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import multipart from "@fastify/multipart";
import fastify from "fastify";
import { config } from "./config.js";
import { registerAuthRoutes } from "./auth.js";
import { registerAssetRoutes } from "./routes/assets.js";
import { registerBackupRoutes } from "./routes/backup.js";
import { registerAiRoutes } from "./routes/ai.js";
import { registerActivationCodeRoutes } from "./routes/activationCodes.js";
import { registerAnniversaryCardRoutes } from "./routes/anniversaryCards.js";
import { registerMemoryRoutes } from "./routes/memories.js";
import { registerSettingsRoutes } from "./routes/settings.js";
import { registerTripGuideRoutes } from "./routes/tripGuides.js";
import { registerWechatRoutes } from "./routes/wechat.js";

const app = fastify({ logger: true, bodyLimit: 12 * 1024 * 1024 });

await app.register(cors, {
  origin: config.WEB_ORIGIN.split(",").map((origin) => origin.trim()),
  credentials: true,
});
await app.register(jwt, { secret: config.JWT_SECRET });
await app.register(multipart);

app.get("/health", async () => ({ ok: true }));

await registerAuthRoutes(app);
await registerWechatRoutes(app);
await registerActivationCodeRoutes(app);
await registerMemoryRoutes(app);
await registerAnniversaryCardRoutes(app);
await registerAssetRoutes(app);
await registerSettingsRoutes(app);
await registerBackupRoutes(app);
await registerTripGuideRoutes(app);
await registerAiRoutes(app);

try {
  await app.listen({ host: config.HOST, port: config.PORT });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}

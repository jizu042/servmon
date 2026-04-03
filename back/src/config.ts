import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1),
  MONITOR_ADDRESS: z
    .string()
    .min(1)
    .regex(/^[a-zA-Z0-9.-]+(?::\d{1,5})?$/, "MONITOR_ADDRESS must be host:port or host"),
  SERVER_DISPLAY_NAME: z.string().optional().default("Minecraft Server"),
  ISMCSERVER_TOKEN: z.string().optional().default(""),
  MCSTATUS_API_BASE: z.string().url().default("https://api.mcstatus.io/v2"),
  ISMCSERVER_API_BASE: z.string().url().default("https://api.ismcserver.online"),
  FRONTEND_URL: z.string().default("*"),
  API_TIMEOUT_MS: z.coerce.number().default(9000),
  REALTIME_CHECK_TIMEOUT_MS: z.coerce.number().default(1500),
  RATE_LIMIT_PER_MIN: z.coerce.number().default(120),
  ELY_SKIN_BASE: z.string().url().default("https://skinsystem.ely.by/skins"),
  POLL_INTERVAL_MS: z.coerce.number().min(5000).default(10000),
  BRANDING_CACHE_TTL_SEC: z.coerce.number().default(300),
  STATUS_CACHE_TTL_SEC: z.coerce.number().default(45),
  REVEAL_SECRET: z.string().optional(),
  ENABLE_ISMC_HTML_SCRAPE: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1")
});

export type AppConfig = z.infer<typeof envSchema>;

let cached: AppConfig | null = null;

export function loadConfig(): AppConfig {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error(parsed.error.flatten().fieldErrors);
    throw new Error("Invalid environment variables");
  }
  cached = parsed.data;
  return cached;
}

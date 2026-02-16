import { z } from 'zod';

/**
 * Environment configuration schema with zod validation.
 * The app will fail fast on startup if required variables are missing.
 */
const envSchema = z.object({
  // WhatsApp
  MESSAGING_PROVIDER: z.string().default('baileys'),
  WHATSAPP_SESSION_DIR: z.string().default('./data/session'),
  MY_PHONE_NUMBER: z.string().min(1, 'MY_PHONE_NUMBER is required'),

  // Location (for prayer times)
  LATITUDE: z
    .string()
    .default('30.7865')
    .transform((v) => parseFloat(v)),
  LONGITUDE: z
    .string()
    .default('31.0004')
    .transform((v) => parseFloat(v)),
  PRAYER_CALC_METHOD: z.string().default('egyptian'),

  // OpenAI
  OPENAI_API_KEY: z.string().min(1, 'OPENAI_API_KEY is required'),
  STT_PROVIDER: z.string().default('whisper-api'),
  WHISPER_DEFAULT_LANG: z.string().default('ar'),

  // Paths
  HABITS_DIR: z.string().default('./data/habits'),
  DAYS_DIR: z.string().default('./data/days'),
  MEDIA_DIR: z.string().default('./data/media'),

  // App
  PORT: z
    .string()
    .default('3000')
    .transform((v) => parseInt(v, 10)),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export type EnvConfig = z.infer<typeof envSchema>;

/**
 * Validate and parse environment variables.
 * Throws a descriptive error if validation fails.
 */
function validateEnv(): EnvConfig {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.errors
      .map((e) => `  - ${e.path.join('.')}: ${e.message}`)
      .join('\n');
    throw new Error(`Environment validation failed:\n${errors}`);
  }

  return result.data;
}

/**
 * NestJS configuration factory.
 * Called by ConfigModule.forRoot({ load: [configuration] })
 */
export default () => {
  const env = validateEnv();

  return {
    port: env.PORT,
    nodeEnv: env.NODE_ENV,

    whatsapp: {
      provider: env.MESSAGING_PROVIDER,
      sessionDir: env.WHATSAPP_SESSION_DIR,
      myPhoneNumber: env.MY_PHONE_NUMBER,
    },

    location: {
      latitude: env.LATITUDE,
      longitude: env.LONGITUDE,
      calcMethod: env.PRAYER_CALC_METHOD,
    },

    openai: {
      apiKey: env.OPENAI_API_KEY,
      sttProvider: env.STT_PROVIDER,
      defaultLang: env.WHISPER_DEFAULT_LANG,
    },

    paths: {
      habits: env.HABITS_DIR,
      days: env.DAYS_DIR,
      media: env.MEDIA_DIR,
    },
  };
};

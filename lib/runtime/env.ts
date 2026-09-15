import { getCloudflareContext } from "@opennextjs/cloudflare";

type RuntimeEnv = Partial<{
  NEXT_PUBLIC_SUPABASE_URL: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY: string;
  NEXT_PUBLIC_APP_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  USER_MANAGEMENT_BACKEND: string;
}>;

export function getRuntimeEnvValue(key: keyof RuntimeEnv) {
  return process.env[key] ?? getCloudflareEnvValue(key);
}

export function hasRuntimeEnvValue(key: keyof RuntimeEnv) {
  return Boolean(getRuntimeEnvValue(key));
}

function getCloudflareEnvValue(key: keyof RuntimeEnv) {
  try {
    const context = getCloudflareContext();
    return (context.env as RuntimeEnv)[key];
  } catch {
    return undefined;
  }
}

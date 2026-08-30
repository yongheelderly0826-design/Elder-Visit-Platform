import { hasRuntimeEnvValue } from "@/lib/runtime/env";
import { isGasConfigured } from "@/lib/gas-client";

export type SystemStatus = {
  supabaseUrlConfigured: boolean;
  supabaseAnonKeyConfigured: boolean;
  gasConfigured: boolean;
  dataMode: "mock" | "gas_ready" | "supabase_ready";
  missing: string[];
};

export function getSystemStatus(): SystemStatus {
  const supabaseUrlConfigured = hasRuntimeEnvValue("NEXT_PUBLIC_SUPABASE_URL");
  const supabaseAnonKeyConfigured = hasRuntimeEnvValue("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const gasConfigured = isGasConfigured();

  const missing = [
    !gasConfigured ? "GAS_WEB_APP_URL / GAS_API_TOKEN" : null,
    !supabaseUrlConfigured ? "NEXT_PUBLIC_SUPABASE_URL" : null,
    !supabaseAnonKeyConfigured ? "NEXT_PUBLIC_SUPABASE_ANON_KEY" : null,
  ].filter((item): item is string => Boolean(item));

  let dataMode: SystemStatus["dataMode"] = "mock";
  if (gasConfigured) {
    dataMode = "gas_ready";
  } else if (supabaseUrlConfigured && supabaseAnonKeyConfigured) {
    dataMode = "supabase_ready";
  }

  return {
    supabaseUrlConfigured,
    supabaseAnonKeyConfigured,
    gasConfigured,
    dataMode,
    missing,
  };
}

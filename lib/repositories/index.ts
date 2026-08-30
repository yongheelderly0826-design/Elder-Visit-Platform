import { getSystemStatus } from "@/lib/system/env";
import { mockRepository } from "@/lib/repositories/mock";
import { supabaseRepository } from "@/lib/repositories/supabase";
import { gasRepository } from "@/lib/repositories/gas";

export function getRepository() {
  const status = getSystemStatus();

  if (status.dataMode === "gas_ready") {
    return gasRepository;
  }

  if (status.dataMode === "supabase_ready") {
    return supabaseRepository;
  }

  return mockRepository;
}

import type { Metadata } from "next";
import { ManagerLoginPanel } from "@/components/auth/manager-login-panel";

export const metadata: Metadata = {
  title: "總承辦登入｜獨居長者訪查",
};

export default function YongheManagerLoginPage() {
  return <ManagerLoginPanel />;
}

import type { Metadata } from "next";
import { DeskClerkLoginPanel } from "@/components/auth/desk-clerk-login-panel";

export const metadata: Metadata = {
  title: "臨時登打登入｜獨居長者訪查",
};

export default function TempKeyLoginPage() {
  return <DeskClerkLoginPanel />;
}

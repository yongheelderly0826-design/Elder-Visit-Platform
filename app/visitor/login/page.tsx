import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { VisitorLoginPanel } from "@/components/auth/visitor-login-panel";

export const metadata: Metadata = {
  title: "訪員登入｜獨居長者訪查",
  description: "訪員專用登入入口，登入後顯示個人訪員證 QR。",
  manifest: "/visitor-manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "訪員證",
  },
};

export default async function VisitorLoginPage() {
  const cookieStore = await cookies();
  if (cookieStore.get("demo_role")?.value === "visitor") {
    redirect("/visitor/home");
  }

  return <VisitorLoginPanel />;
}

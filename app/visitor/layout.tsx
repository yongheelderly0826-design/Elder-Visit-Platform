import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: {
    default: "訪員工作台",
    template: "%s｜訪員工作台",
  },
  description: "訪員證、訪視任務、核銷與出勤簽到。",
  manifest: "/visitor-manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "訪員證",
  },
  other: {
    "apple-mobile-web-app-capable": "yes",
  },
};

export default function VisitorLayout({ children }: { children: ReactNode }) {
  return children;
}

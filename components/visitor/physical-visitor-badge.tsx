"use client";

import { useState } from "react";
import { resolvePhysicalBadgeProfile } from "@/lib/domain/physical-visitor-badge";

const BADGE_RULES = [
  "會配戴訪員證",
  "會主動出示衛生福利部公文",
  "不會洩漏個人資料給任何人",
  "不會詢問與訪查無關的資料",
  "不會要求提供帳號、存摺、印章",
] as const;

/**
 * 永和區證件套模板（正面背景來自官方 PDF／DOCX 裁切）。
 * 證件照與姓名以定位疊加；點擊可翻到背面守則。
 */
export function PhysicalVisitorBadge({
  visitorId,
  email,
  name,
  className,
}: {
  visitorId?: string | null;
  email?: string | null;
  name?: string | null;
  className?: string;
}) {
  const profile = resolvePhysicalBadgeProfile({ visitorId, email, name });
  const [showBack, setShowBack] = useState(false);

  return (
    <div className={`mx-auto w-full max-w-[22rem] ${className ?? ""}`}>
      <button
        type="button"
        className="block w-full text-left"
        onClick={() => setShowBack((value) => !value)}
        aria-label={showBack ? "顯示訪員證正面" : "顯示訪員證背面守則"}
      >
        {showBack ? (
          <article
            className="relative aspect-[873/1250] w-full overflow-hidden rounded-xl border border-rose-200 shadow-[0_10px_28px_rgba(120,40,55,0.12)]"
            style={{
              backgroundImage: "url(/badges/yonghe-badge-sleeve-back.jpg)",
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          >
            {/* 背面圖已含完整守則文字；保留語意清單供螢幕閱讀器 */}
            <ul className="sr-only">
              {BADGE_RULES.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ul>
          </article>
        ) : (
          <article
            className="relative aspect-[873/1250] w-full overflow-hidden rounded-xl border border-rose-200 shadow-[0_10px_28px_rgba(120,40,55,0.12)]"
            style={{
              backgroundImage: "url(/badges/yonghe-badge-sleeve-front.jpg)",
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
            aria-label={`${profile.displayName} 訪員證`}
          >
            {/* 證件照槽：對齊官方模板灰框（像素偵測：41.58 / 43.28 / 35.05×31.12） */}
            <div
              className="absolute overflow-hidden bg-white"
              style={{
                left: "41.58%",
                top: "43.28%",
                width: "35.05%",
                height: "31.12%",
              }}
            >
              {profile.portraitSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profile.portraitSrc}
                  alt={`${profile.displayName} 證件照（模擬）`}
                  className="h-full w-full object-cover object-top"
                  draggable={false}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs text-slate-500">
                  證件照
                </div>
              )}
            </div>

            {/* 姓名：對齊照片槽水平中心、置於灰框下方 */}
            <p
              className="absolute font-black leading-none text-slate-900"
              style={{
                left: "41.58%",
                width: "35.05%",
                top: "75.4%",
                textAlign: "center",
                fontSize: "clamp(1.05rem, 5.2vw, 1.35rem)",
                letterSpacing: "0.06em",
              }}
            >
              {profile.displayName}
            </p>
          </article>
        )}
      </button>
      <p className="mt-2 text-center text-xs text-muted-foreground">
        {showBack ? "點一下回到正面" : "點一下可看背面守則"}
      </p>
    </div>
  );
}

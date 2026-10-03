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

/** 官方證件套裁切比例（單張含完整黑框） */
const BADGE_ASPECT = "781 / 1076";

/** 證件照內縮於灰框內，保留框線可見 */
const PHOTO_SLOT = {
  left: "33.03%",
  top: "38.20%",
  width: "37.77%",
  height: "35.32%",
} as const;

/**
 * 永和區證件套模板。
 * - 整張含完整黑框，依手機寬高自動縮小，不超出畫面
 * - 證件照疊在灰框內（不蓋過框線）；姓名置於照片下方
 * - 點擊翻面看守則
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
    <div className={`mx-auto w-full max-w-full overflow-x-hidden ${className ?? ""}`}>
      <div
        className="@container mx-auto w-full"
        style={{
          // 不超出手機可視寬，也不因證件過高而撐破畫面
          maxWidth: "min(100%, 22rem, calc((100dvh - 15rem) * 781 / 1076))",
        }}
      >
        <button
          type="button"
          className="block w-full max-w-full text-left"
          onClick={() => setShowBack((value) => !value)}
          aria-label={showBack ? "顯示訪員證正面" : "顯示訪員證背面守則"}
        >
          <article
            className="relative w-full max-w-full overflow-hidden bg-white shadow-[0_8px_24px_rgba(120,40,55,0.1)]"
            style={{ aspectRatio: BADGE_ASPECT }}
            aria-label={showBack ? "訪員證背面守則" : `${profile.displayName} 訪員證`}
          >
            {/* 用 img 填滿，避免 background-size 裁切導致黑框缺失 */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={
                showBack
                  ? "/badges/yonghe-badge-sleeve-back.jpg"
                  : "/badges/yonghe-badge-sleeve-front.jpg"
              }
              alt=""
              aria-hidden
              className="pointer-events-none absolute inset-0 h-full w-full select-none object-fill"
              draggable={false}
            />

            {showBack ? (
              <ul className="sr-only">
                {BADGE_RULES.map((rule) => (
                  <li key={rule}>{rule}</li>
                ))}
              </ul>
            ) : (
              <>
                <div className="absolute overflow-hidden bg-white" style={PHOTO_SLOT}>
                  {profile.portraitSrc ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={profile.portraitSrc}
                      alt={`${profile.displayName} 證件照（模擬）`}
                      className="h-full w-full object-cover object-top"
                      draggable={false}
                    />
                  ) : null}
                </div>

                <p
                  className="absolute overflow-hidden text-ellipsis whitespace-nowrap font-black leading-none text-slate-900"
                  style={{
                    left: PHOTO_SLOT.left,
                    width: PHOTO_SLOT.width,
                    top: "74.81%",
                    textAlign: "center",
                    // 官方 PDF 姓名約 24pt（相對單張證卡寬度 ≈ 8–9%）；勿縮成註解級小字
                    fontSize: "clamp(1.15rem, 8.5cqw, 1.85rem)",
                    letterSpacing: "0.08em",
                  }}
                >
                  {profile.displayName}
                </p>
              </>
            )}
          </article>
        </button>
        <p className="mt-2 text-center text-xs text-muted-foreground">
          {showBack ? "點一下回到正面" : "點一下可看背面守則"}
        </p>
      </div>
    </div>
  );
}

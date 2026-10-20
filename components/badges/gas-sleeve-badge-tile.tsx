"use client";

import { useState } from "react";
import {
  GAS_BADGE_ASPECT,
  GAS_BADGE_PHOTO_SLOT,
  GAS_BADGE_RULES,
} from "@/lib/domain/gas-physical-badge-print";

export function GasSleeveBadgeTile({
  side,
  name,
  visitorId,
  portraitSrc,
}: {
  side: "front" | "back";
  name?: string;
  visitorId?: string;
  portraitSrc?: string | null;
}) {
  const displayName = (name || "訪員").trim() || "訪員";
  const [photoFailed, setPhotoFailed] = useState(false);
  const showPhoto = Boolean(portraitSrc) && !photoFailed;

  return (
    <article
      className="gas-sleeve-badge @container relative h-full w-full overflow-hidden bg-white"
      style={{ aspectRatio: GAS_BADGE_ASPECT }}
      aria-label={
        side === "back"
          ? "訪員證背面守則"
          : `${displayName} 訪員證正面${visitorId ? `（${visitorId}）` : ""}`
      }
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={
          side === "back"
            ? "/badges/yonghe-badge-sleeve-back.jpg"
            : "/badges/yonghe-badge-sleeve-front.jpg"
        }
        alt=""
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full select-none object-fill"
        draggable={false}
      />

      {side === "back" ? (
        <ul className="sr-only">
          {GAS_BADGE_RULES.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
      ) : (
        <>
          <div className="absolute overflow-hidden bg-white" style={GAS_BADGE_PHOTO_SLOT}>
            {showPhoto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={portraitSrc!}
                alt={`${displayName} 證件照`}
                className="h-full w-full object-cover object-top"
                draggable={false}
                onError={() => setPhotoFailed(true)}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-slate-100 text-[10px] text-slate-400">
                無證件照
              </div>
            )}
          </div>
          <p
            className="absolute overflow-hidden text-ellipsis whitespace-nowrap font-black leading-none text-slate-900"
            style={{
              left: GAS_BADGE_PHOTO_SLOT.left,
              width: GAS_BADGE_PHOTO_SLOT.width,
              top: "74.81%",
              textAlign: "center",
              fontSize: "clamp(0.7rem, 8.5cqw, 1.35rem)",
              letterSpacing: "0.08em",
            }}
          >
            {displayName}
          </p>
        </>
      )}
    </article>
  );
}

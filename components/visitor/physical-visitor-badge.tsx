import { resolvePhysicalBadgeProfile } from "@/lib/domain/physical-visitor-badge";

/** 衛福部風格圓形標章（示意，非官方標誌重繪版權素材） */
function MohwStyleSeal({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <circle cx="32" cy="32" r="30" fill="#f4c4cb" stroke="#9a3d4a" strokeWidth="2" />
      <circle cx="32" cy="32" r="24" fill="none" stroke="#b85a68" strokeWidth="1.5" />
      <path
        d="M32 14c-6 4-10 10-10 16 0 8 6 14 10 18 4-4 10-10 10-18 0-6-4-12-10-16z"
        fill="#c45c6a"
        opacity="0.85"
      />
      <circle cx="32" cy="28" r="5" fill="#fff5f6" />
      <path d="M22 44h20v3H22z" fill="#9a3d4a" />
      <text
        x="32"
        y="52"
        textAnchor="middle"
        fontSize="7"
        fill="#6b2a34"
        fontFamily="system-ui,sans-serif"
        fontWeight="700"
      >
        衛福
      </text>
    </svg>
  );
}

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

  return (
    <article
      className={`mx-auto w-full max-w-[22rem] overflow-hidden rounded-2xl border border-rose-200/80 bg-white shadow-[0_10px_28px_rgba(120,40,55,0.12)] ${className ?? ""}`}
      aria-label={`${profile.displayName} 訪員證`}
    >
      <header className="flex items-start gap-3 bg-[#f7d3d8] px-4 py-3">
        <MohwStyleSeal className="mt-0.5 h-12 w-12 shrink-0" />
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="text-right text-sm font-semibold tracking-wide text-slate-800">
            {profile.yearLabel}
          </p>
          <p className="mt-1 text-right text-[15px] font-bold leading-snug text-slate-900">
            {profile.programTitle}
          </p>
        </div>
      </header>

      <div className="flex flex-col items-center px-5 pb-5 pt-4">
        <h2 className="text-[1.65rem] font-black tracking-[0.35em] text-slate-900">訪員證</h2>

        <div className="mt-4 w-[58%] overflow-hidden rounded-sm border border-slate-300 bg-slate-100 shadow-inner">
          {profile.portraitSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.portraitSrc}
              alt={`${profile.displayName} 證件照（模擬）`}
              className="aspect-[3/4] w-full object-cover object-top"
            />
          ) : (
            <div className="flex aspect-[3/4] w-full items-center justify-center bg-gradient-to-b from-slate-100 to-slate-200 text-sm text-slate-500">
              證件照
            </div>
          )}
        </div>

        <p className="mt-4 text-center text-[1.75rem] font-black tracking-wide text-slate-900">
          {profile.displayName}
        </p>
      </div>

      <footer className="space-y-0.5 px-5 pb-5 text-center text-[13px] leading-6 text-slate-700">
        <p>新北市政府</p>
        <p>永和區公所</p>
        <p>
          查詢電話：
          <a
            href={`tel:${String(profile.inquiryPhone).replace(/[^\d+#]/g, "")}`}
            className="underline decoration-slate-300 underline-offset-2"
          >
            {profile.inquiryPhone}
          </a>
        </p>
      </footer>
    </article>
  );
}

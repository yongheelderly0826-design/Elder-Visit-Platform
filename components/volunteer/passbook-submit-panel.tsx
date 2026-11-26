"use client";

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { BrandLogo } from "@/components/layout/brand-logo";
import { Button } from "@/components/ui/button";
import {
  createCompactPassbookDataUrl,
  readFileAsDataUrl,
} from "@/lib/client/passbook-image";
import { findTaiwanBankByCode, matchTaiwanBanks } from "@/lib/domain/taiwan-banks";

type Step = "verify" | "form" | "success" | "closed";

type MeData = {
  authenticated?: boolean;
  visitorId?: string;
  name?: string;
  campaignCode?: string;
  deadline?: string;
  closed?: boolean;
};

export function PassbookSubmitPanel({
  initialCampaignCode = "",
}: {
  initialCampaignCode?: string;
}) {
  // Campaign code is optional alias only; entry always starts at identity verify.
  const [campaignCode] = useState(initialCampaignCode);
  const [step, setStep] = useState<Step>("verify");
  const [name, setName] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [phoneLast4, setPhoneLast4] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [bankQuery, setBankQuery] = useState("");
  const [bankName, setBankName] = useState("");
  const [bankCode, setBankCode] = useState("");
  const [addressType, setAddressType] = useState<"居住地址" | "戶籍地址" | "">(
    "",
  );
  const [address, setAddress] = useState("");
  const [passbookDataUrl, setPassbookDataUrl] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [deadline, setDeadline] = useState("2026-12-30");
  const [sessionName, setSessionName] = useState("");

  const bankSuggestions = useMemo(
    () => matchTaiwanBanks(bankQuery || bankCode || bankName, 6),
    [bankQuery, bankCode, bankName],
  );

  useEffect(() => {
    let cancelled = false;
    async function loadMe() {
      try {
        const response = await fetch("/api/volunteer/passbook/me", { cache: "no-store" });
        const json = (await response.json()) as { data?: MeData };
        if (cancelled || !json.data) return;
        if (json.data.deadline) setDeadline(json.data.deadline);
        if (json.data.closed) {
          setStep("closed");
          return;
        }
        if (json.data.authenticated && json.data.visitorId) {
          setSessionName(json.data.name ?? "");
          setAccountName((current) => current || json.data?.name || "");
          setStep("form");
        }
      } catch {
        // ignore — stay on current step
      }
    }
    void loadMe();
    return () => {
      cancelled = true;
    };
  }, []);

  function selectBank(code: string, bankDisplayName: string) {
    setBankCode(code);
    setBankName(bankDisplayName);
    setBankQuery(`${code} ${bankDisplayName}`);
  }

  function onBankQueryChange(value: string) {
    setBankQuery(value);
    const digits = value.replace(/\D/g, "").slice(0, 3);
    if (digits.length === 3) {
      const matched = findTaiwanBankByCode(digits);
      if (matched) {
        setBankCode(matched.code);
        setBankName(matched.name);
        return;
      }
    }
    const byName = matchTaiwanBanks(value, 1)[0];
    if (byName && value.includes(byName.name)) {
      setBankCode(byName.code);
      setBankName(byName.name);
    }
  }

  async function handleVerify(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/volunteer/passbook/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...(campaignCode.trim() ? { campaignCode: campaignCode.trim() } : {}),
          name: name.trim(),
          idNumber: idNumber.trim(),
          phoneLast4: phoneLast4.trim(),
        }),
      });
      const json = (await response.json()) as {
        data?: { visitorId?: string; name?: string; deadline?: string };
        error?: { message?: string };
      };
      if (!response.ok || !json.data?.visitorId) {
        setMessage(json.error?.message ?? "無法確認身分或通道已關閉，請聯絡承辦");
        return;
      }
      setSessionName(json.data.name ?? name.trim());
      setAccountName(json.data.name ?? name.trim());
      if (json.data.deadline) setDeadline(json.data.deadline);
      setStep("form");
    } catch {
      setMessage("目前無法連線，請稍後再試。");
    } finally {
      setBusy(false);
    }
  }

  async function handlePassbookFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setMessage("請上傳存摺封面照片（勿傳 PDF）。");
      return;
    }
    setPhotoBusy(true);
    setMessage("正在壓縮存摺照片…");
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const compact = await createCompactPassbookDataUrl(dataUrl);
      setPassbookDataUrl(compact);
      setMessage("已壓縮存摺照片，請確認後送出。");
    } catch {
      setMessage("存摺照片處理失敗，請重新拍攝較清楚的圖片。");
    } finally {
      setPhotoBusy(false);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!bankName || !bankCode) {
      setMessage("請選擇銀行名稱／代碼。");
      return;
    }
    if (!addressType) {
      setMessage("請選擇要填寫居住地址或戶籍地址。");
      return;
    }
    if (address.trim().length < 6) {
      setMessage("請填寫完整地址（含縣市區與街道路名）。");
      return;
    }
    if (!passbookDataUrl) {
      setMessage("請上傳存摺封面照片。");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/volunteer/passbook/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          accountName: accountName.trim(),
          accountNumber: accountNumber.replace(/\s/g, "").trim(),
          bankName,
          bankCode,
          addressType,
          address: address.trim(),
          passbookDataUrl,
        }),
      });
      const json = (await response.json()) as {
        message?: string;
        error?: { message?: string };
      };
      if (!response.ok) {
        setMessage(json.error?.message ?? "送出失敗，請稍後再試。");
        return;
      }
      setStep("success");
      setMessage(json.message ?? null);
    } catch {
      setMessage("送出失敗，請稍後再試。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-dvh bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-teal-50 via-stone-50 to-stone-100 px-4 py-8 text-stone-800">
      <div className="mx-auto flex w-full max-w-md flex-col gap-6">
        <header className="space-y-3 text-center">
          <div className="flex justify-center">
            <BrandLogo />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">補傳匯款存摺資料</h1>
          <p className="text-sm leading-relaxed text-stone-600">
            僅供車馬費／核銷匯款確認，資料僅公所承辦可見。通道開放至{" "}
            <span className="font-medium text-stone-800">{deadline.replace(/-/g, "/")}</span>
            。
          </p>
        </header>

        {step === "closed" && (
          <CalmCard>
            <p className="text-sm leading-relaxed">本補件通道已關閉，請聯絡承辦。</p>
          </CalmCard>
        )}

        {step === "verify" && (
          <CalmCard>
            <form className="space-y-4" onSubmit={handleVerify}>
              <Field label="姓名">
                <input
                  className="h-11 w-full rounded-md border border-stone-200 bg-white px-3 text-sm"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  autoComplete="name"
                  required
                />
              </Field>
              <Field label="身分證字號">
                <input
                  className="h-11 w-full rounded-md border border-stone-200 bg-white px-3 text-sm uppercase"
                  value={idNumber}
                  onChange={(event) => setIdNumber(event.target.value.toUpperCase())}
                  autoComplete="off"
                  required
                />
              </Field>
              <Field label="手機末四碼">
                <input
                  className="h-11 w-full rounded-md border border-stone-200 bg-white px-3 text-sm"
                  inputMode="numeric"
                  maxLength={4}
                  value={phoneLast4}
                  onChange={(event) =>
                    setPhoneLast4(event.target.value.replace(/\D/g, "").slice(0, 4))
                  }
                  placeholder="註冊／主檔手機末四碼"
                  required
                />
              </Field>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? "確認中…" : "確認身分"}
              </Button>
            </form>
          </CalmCard>
        )}

        {step === "form" && (
          <CalmCard>
            <p className="mb-4 text-sm text-stone-600">
              您好，{sessionName || "訪查員"}。請填寫匯款帳戶、地址與存摺封面。
            </p>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <Field label="帳戶名稱（戶名）">
                <input
                  className="h-11 w-full rounded-md border border-stone-200 bg-white px-3 text-sm"
                  value={accountName}
                  onChange={(event) => setAccountName(event.target.value)}
                  required
                />
              </Field>
              <Field label="帳戶號碼（完整）">
                <input
                  className="h-11 w-full rounded-md border border-stone-200 bg-white px-3 text-sm"
                  inputMode="numeric"
                  value={accountNumber}
                  onChange={(event) =>
                    setAccountNumber(event.target.value.replace(/[^\d-]/g, ""))
                  }
                  placeholder="請輸入完整帳號"
                  required
                />
              </Field>
              <Field label="銀行名稱／代碼">
                <input
                  className="h-11 w-full rounded-md border border-stone-200 bg-white px-3 text-sm"
                  value={bankQuery}
                  onChange={(event) => onBankQueryChange(event.target.value)}
                  placeholder="輸入代碼或銀行名稱，例如 004 或 臺灣銀行"
                  required
                />
                {bankSuggestions.length > 0 && (
                  <ul className="mt-2 max-h-40 overflow-auto rounded-md border border-stone-200 bg-white text-sm">
                    {bankSuggestions.map((bank) => (
                      <li key={bank.code}>
                        <button
                          type="button"
                          className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-teal-50"
                          onClick={() => selectBank(bank.code, bank.name)}
                        >
                          <span>{bank.name}</span>
                          <span className="text-stone-500">{bank.code}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {bankCode && bankName && (
                  <p className="mt-2 text-xs text-stone-500">
                    已選：{bankCode} {bankName}
                  </p>
                )}
              </Field>
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium text-stone-700">
                  地址類型（擇一）
                </legend>
                <div className="flex flex-wrap gap-3">
                  {(["居住地址", "戶籍地址"] as const).map((option) => (
                    <label
                      key={option}
                      className="inline-flex items-center gap-2 rounded-md border border-stone-200 bg-white px-3 py-2 text-sm"
                    >
                      <input
                        type="radio"
                        name="addressType"
                        value={option}
                        checked={addressType === option}
                        onChange={() => setAddressType(option)}
                        required
                      />
                      {option}
                    </label>
                  ))}
                </div>
              </fieldset>
              <Field label={addressType ? addressType : "居住／戶籍地址"}>
                <textarea
                  className="min-h-[5.5rem] w-full rounded-md border border-stone-200 bg-white px-3 py-2 text-sm leading-relaxed"
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  placeholder="例：新北市永和區永和路一段 xx 號"
                  required
                />
                <p className="mt-1.5 text-xs font-normal text-stone-500">
                  核銷匯款用，請擇一填寫完整地址。
                </p>
              </Field>
              <Field label="存摺封面照片">
                <div className="rounded-md border border-dashed border-stone-300 bg-white p-3">
                  <p className="text-xs leading-relaxed text-stone-500">
                    請拍攝存摺封面，帳號清晰、勿遮擋。系統會自動縮小並轉成黑白圖。
                  </p>
                  <input
                    className="mt-3 block w-full text-sm"
                    type="file"
                    accept="image/*"
                    capture="environment"
                    disabled={photoBusy}
                    onChange={(event) => void handlePassbookFile(event.target.files?.[0])}
                  />
                  {passbookDataUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={passbookDataUrl}
                      alt="存摺預覽"
                      className="mt-3 max-h-48 w-full rounded-md border object-contain"
                    />
                  )}
                </div>
              </Field>
              <Button type="submit" className="w-full" disabled={busy || photoBusy}>
                {busy ? "送出中…" : "送出補件"}
              </Button>
            </form>
          </CalmCard>
        )}

        {step === "success" && (
          <CalmCard>
            <p className="text-base font-medium text-teal-900">已收到您的存摺資料</p>
            <p className="mt-2 text-sm leading-relaxed text-stone-600">
              承辦確認後將用於匯款；無需重複傳送。若需修改，請聯絡承辦協助。
            </p>
          </CalmCard>
        )}

        {message && step !== "success" && (
          <p className="text-center text-sm text-amber-800" role="status">
            {message}
          </p>
        )}
      </div>
    </div>
  );
}

function CalmCard({ children }: { children: ReactNode }) {
  return (
    <section className="rounded-xl border border-stone-200/80 bg-white/90 p-5 shadow-sm backdrop-blur">
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm font-medium text-stone-700">
      {label}
      <div className="mt-2">{children}</div>
    </label>
  );
}

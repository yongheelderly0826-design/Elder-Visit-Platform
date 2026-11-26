/** 台灣主要銀行代碼（匯款／存摺補件 autocomplete） */

export type TaiwanBank = {
  code: string;
  name: string;
};

export const TAIWAN_BANKS: TaiwanBank[] = [
  { code: "004", name: "臺灣銀行" },
  { code: "005", name: "土地銀行" },
  { code: "006", name: "合作金庫銀行" },
  { code: "007", name: "第一銀行" },
  { code: "008", name: "華南銀行" },
  { code: "009", name: "彰化銀行" },
  { code: "011", name: "上海商業儲蓄銀行" },
  { code: "012", name: "台北富邦銀行" },
  { code: "013", name: "國泰世華銀行" },
  { code: "016", name: "高雄銀行" },
  { code: "017", name: "兆豐國際商業銀行" },
  { code: "021", name: "花旗銀行" },
  { code: "048", name: "王道銀行" },
  { code: "050", name: "臺灣中小企業銀行" },
  { code: "052", name: "渣打銀行" },
  { code: "053", name: "台中銀行" },
  { code: "054", name: "京城銀行" },
  { code: "081", name: "匯豐銀行" },
  { code: "101", name: "瑞興銀行" },
  { code: "102", name: "華泰銀行" },
  { code: "103", name: "臺灣新光銀行" },
  { code: "108", name: "陽信銀行" },
  { code: "114", name: "板信銀行" },
  { code: "118", name: "板信商業銀行" },
  { code: "147", name: "三信銀行" },
  { code: "700", name: "中華郵政" },
  { code: "803", name: "聯邦銀行" },
  { code: "805", name: "遠東銀行" },
  { code: "806", name: "元大銀行" },
  { code: "807", name: "永豐銀行" },
  { code: "808", name: "玉山銀行" },
  { code: "809", name: "凱基銀行" },
  { code: "812", name: "台新銀行" },
  { code: "815", name: "日盛銀行" },
  { code: "816", name: "安泰銀行" },
  { code: "822", name: "中國信託銀行" },
  { code: "823", name: "將來銀行" },
  { code: "824", name: "連線銀行" },
  { code: "826", name: "樂天銀行" },
];

export function matchTaiwanBanks(query: string, limit = 8): TaiwanBank[] {
  const q = query.trim().toLowerCase();
  if (!q) return TAIWAN_BANKS.slice(0, limit);
  const digits = q.replace(/\D/g, "");
  const scored = TAIWAN_BANKS.map((bank) => {
    const name = bank.name.toLowerCase();
    let score = 0;
    if (digits && bank.code.startsWith(digits)) score += 100 - digits.length;
    if (name.includes(q)) score += 50;
    if (bank.code === digits) score += 200;
    if (name.startsWith(q)) score += 30;
    return { bank, score };
  })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((item) => item.bank);
}

export function findTaiwanBankByCode(code: string): TaiwanBank | null {
  const normalized = code.replace(/\D/g, "");
  return TAIWAN_BANKS.find((bank) => bank.code === normalized) ?? null;
}

/** 存摺補件／車馬費匯款僅接受台新、合庫 */
export const PASSBOOK_ALLOWED_BANK_CODES = ["006", "812"] as const;

export type PassbookAllowedBankCode = (typeof PASSBOOK_ALLOWED_BANK_CODES)[number];

export const PASSBOOK_ALLOWED_BANKS: TaiwanBank[] = PASSBOOK_ALLOWED_BANK_CODES.map(
  (code) => findTaiwanBankByCode(code)!,
);

export function isPassbookAllowedBankCode(code: string): code is PassbookAllowedBankCode {
  const normalized = code.replace(/\D/g, "");
  return (PASSBOOK_ALLOWED_BANK_CODES as readonly string[]).includes(normalized);
}

export function matchPassbookAllowedBanks(query: string, limit = 8): TaiwanBank[] {
  const q = query.trim().toLowerCase();
  if (!q) return PASSBOOK_ALLOWED_BANKS.slice(0, limit);
  const digits = q.replace(/\D/g, "");
  const scored = PASSBOOK_ALLOWED_BANKS.map((bank) => {
    const name = bank.name.toLowerCase();
    let score = 0;
    if (digits && bank.code.startsWith(digits)) score += 100 - digits.length;
    if (name.includes(q)) score += 50;
    if (bank.code === digits) score += 200;
    if (name.startsWith(q)) score += 30;
    // 口語別名
    if (q.includes("合庫") && bank.code === "006") score += 80;
    if (q.includes("台新") && bank.code === "812") score += 80;
    return { bank, score };
  })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((item) => item.bank);
}

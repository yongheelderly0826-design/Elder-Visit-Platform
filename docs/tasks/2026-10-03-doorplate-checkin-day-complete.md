# Task Brief: 門牌簽到與今日完成簽退

## Goal

訪查員到宅時以「受訪地址＋門牌／門口照片＋定位」完成單案簽到；當日派案全部填報完成後提示「今日任務已完成」，並可**手動確認**後簽退志工出勤；訪員端可查看簽到退時數與車馬費／核銷明細。

## Scope

### In scope

- 單案門牌／地址簽到（必拍門牌或門口、顯示派案地址、GPS）
- 今日任務完成提示＋手動確認志工簽退（非全自動）
- 訪員端時數／車馬費（或訪視費）明細頁

### Out of scope

- 門牌 OCR／地址文字比對自動驗證
- 強制自動簽退（不做；僅手動確認）
- 路徑規劃／案件排序優化

## Relevant References

- Product spec: `docs/spec-v2.4.pdf`
- `docs/architecture/data-flow.md`
- `docs/sheets/schema-overview.md`（簽到退紀錄）
- `gas/src/modules/AttendanceModule.gs`
- `gas/src/utils/VolunteerTransportFees.gs`

## Likely Files

- `components/visitor/visit-assignment-clock.tsx`
- `components/visitor/visit-dialogue-form.tsx`
- `components/visitor/day-complete-panel.tsx`（新）
- `components/visitor/visitor-hours-panel.tsx`（新）
- `app/api/visits/clock/route.ts`
- `app/api/visitor/hours/route.ts`（新）
- `app/visitor/hours/page.tsx`（新）
- `app/visitor/tasks/page.tsx`
- `gas/src/modules/AttendanceModule.gs`
- `lib/gas-client.ts` / mock attendance

## Risks / Ambiguities

- 簽退對象為「志工出勤」session，與單案「訪查」簽到退分開；需文案說清楚。
- GAS 需新增 `checkin_photo_url` 並部署後正式環境才有照片存檔。
- 車馬費規則依志工組別；獨居關懷多為季結時數，與訪視費 210 不同。

## User-Facing Impact

- Visible UI impact expected.

## Acceptance Criteria

- 未拍門牌／門口照不可到宅簽到；畫面顯示受訪地址。
- 簽到寫入 GPS；GAS／demo 可保存門牌照片參考。
- 當日無剩餘待填任務時顯示「今日任務已完成」與確認簽退按鈕。
- 訪員可在時數頁看到簽到退紀錄與費用試算／核銷連結。
- `npm run typecheck` / `lint` 通過。

## Verification

- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm run build`
- [ ] Design / UX review completed

## Completion Notes

- What changed: 單案門牌簽到、今日完成＋手動簽退、訪員時數／車馬費頁；GAS 新增 `checkin_photo_url`。
- What was verified: typecheck / lint（見下方 Verification）
- What remains undecided: 自動簽退仍不啟用；門牌 OCR 不做。需部署 GAS 後正式站才會把照片存到 Drive。

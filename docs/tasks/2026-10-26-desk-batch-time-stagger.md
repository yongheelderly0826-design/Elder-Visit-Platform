# Task Brief: 待KEY整批時間+10分

## Goal

場生紙本大量 KEY：在待 KEY 清單只填第 1 筆日期／起迄，後案同日、時段整段 +10 分自動排程；套用後留在清單自行「進表 KEY」，不必逐案再開時間窗。

## Scope

### In scope

- 方案 A：預設時長 10 分、間距 10 分
- 整批預覽＋「套用整批時段」API（衝突稽核）
- 套用後留清單；單案仍可「調整時間」

### Out of scope

- 改核銷規則本體
- 套用後自動進第 1 案表單

## Likely Files

- `lib/domain/desk-care-batch.ts`
- `app/api/manager/care-forms/confirm-time-batch/route.ts`
- `components/manage/care-form-desk-panel.tsx`

## Acceptance Criteria

- 第 1 筆填日期與起迄後，預覽後案同日且 +10×序位
- 時長 > 10 分時阻擋並提示
- 「套用整批時段」成功後清單顯示時間，不自動導向表單
- 有時間的案可直接「進表 KEY」

## Verification

- [ ] `npm run typecheck`
- [ ] Design / UX review completed

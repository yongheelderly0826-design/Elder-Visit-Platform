# Task Brief: GAS紙本訪員證A4列印

## Goal

讓承辦可依 **GAS 訪員名冊** 批次產生永和證件套樣式紙本訪員證：正面含證件照與姓名、A4 每頁 2×2 可裁切，並可一併列印背面守則（含雙面交錯）。

## Scope

### In scope

- GAS 名冊讀取與證件照代理 API
- A4 2×2 裁切排版（正面／背面／正反交錯）
- 使用者管理入口「列印 GAS 證件套」

### Out of scope

- 製卡廠接檔、郵寄流程
- 精準到 0.1mm 的印刷對位校色

## Likely Files

- `lib/domain/gas-physical-badge-print.ts`
- `app/api/users/gas-badge-print/route.ts`
- `app/api/users/gas-headshot/[visitorId]/route.ts`
- `app/workspace/users/badges/gas-print/page.tsx`
- `components/badges/gas-badge-print-sheet.tsx`
- `components/badges/gas-sleeve-badge-tile.tsx`
- `components/workspace/users-panel.tsx`

## Acceptance Criteria

- 管理者可從 `/workspace/users` 開啟列印頁
- 列印頁可選只印正面、只印背面、正反交錯
- A4 每頁 4 張（2×2），含證件照與姓名
- 背面使用官方守則套版

## Verification

- [ ] `npm run typecheck`
- [ ] 本機開啟列印頁目視版面

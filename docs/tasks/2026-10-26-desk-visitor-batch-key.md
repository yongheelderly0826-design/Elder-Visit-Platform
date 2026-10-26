# Task Brief: 關懷表建檔訪查組與多案KEY

## Goal

紙本大量 KEY：先固定民政／社政訪查組並指定主填表人，再一次勾多個案準備派案；每案進表前確認時間並做同組時段衝突稽核（核銷）。非未遇不強制三次訪視。

## Scope

### In scope

- 步驟重排：身份里別 → 訪查組 → 多選個案 → 待 KEY 清單
- 民政／社政分欄複選、手動主填表人
- 批次 prepare 派案；confirm-time 衝突稽核
- 文案：僅未遇需三次

### Out of scope

- 改衛福部匯出欄位
- 同行訪查員寫入獨立 Sheets 欄（先用 notes）

## Likely Files

- `components/manage/care-form-desk-panel.tsx`
- `lib/domain/desk-care-batch.ts`
- `lib/domain/desk-visit-time-audit.ts`
- `app/api/manager/care-forms/prepare/route.ts`
- `app/api/manager/care-forms/confirm-time/route.ts`
- `gas/src/modules/VisitorModule.gs` / `AssignmentModule.gs`

## Acceptance Criteria

- 民政或社政至少一邊有人選；可各勾多人；必須指定主填表人
- 可一次準備多筆派案並清單進表
- 每案進表前確認時間；同組時段重疊阻擋
- 完成／拒訪不要求三次；未遇仍需三次紙本

## Verification

- [ ] `npm run typecheck`
- [ ] Design / UX review completed
- [ ] Deploy GAS（slim volunteer_group、confirm due_date）

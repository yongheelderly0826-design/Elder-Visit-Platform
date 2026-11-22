# Task Brief: 分桶全量名單分頁

## Goal

主管在 `/manager/case-progress` 點選清冊對照 A–F 任一分桶，可開啟**該桶全量名單**（遮罩 PII、分頁 50），含最大的 F 僅清冊待訪 ~9k，且不因 GAS 逾時失敗。

## Scope

### In scope

- GAS `caseProgress.listBucket`＋summary 重算寫入分桶索引表
- 前端點桶開全量分頁表；可選 CSV 匯出（遮罩）
- Next API `/api/manager/case-progress/bucket`
- GAS deploy＋前端 commit/push

### Out of scope

- 未遮罩完整個資下載
- 里別篩選 UI（API 已支援 village）

## Likely Files

- `gas/src/modules/CaseProgressModule.gs`
- `gas/src/Config.gs` / `ApiRouter.gs`
- `components/manage/case-progress-dashboard.tsx`
- `app/api/manager/case-progress/bucket/route.ts`
- `lib/domain/case-progress.ts` / `lib/gas-client.ts`

## Acceptance Criteria

- [x] 九個分桶列皆可點開並分頁瀏覽全量（索引就緒後）
- [x] 回傳姓名／證號遮罩
- [x] F 大桶不靠單次 live join
- [x] `npm run typecheck`／`lint` 通過
- [x] 可選 CSV 匯出（遮罩）

## Completion Notes

- What changed: 新增分桶索引表＋`listBucket`；前端改為全量分頁＋CSV
- What remains: 部署後需在儀表板按一次「強制重算」寫入索引

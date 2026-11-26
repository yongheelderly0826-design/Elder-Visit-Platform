# Task Brief: 進度修正納入關懷表與分桶

## Goal

讓「進度修正」不只改正直 KEY 標記，也能列出並修正 **關懷表**、**分桶索引** 上的建檔／民政／社政／狀態，且以來源資料為準（索引為衍生時會回寫來源）。

## Scope

### In scope

- 進度修正頁三來源分頁：直 KEY｜關懷表｜分桶索引
- 關懷表：list＋批量改正 civil／social／visit_status（連動 visit_result）／建檔顯示名（desk 或 answers 輔助）
- 分桶索引：依里列出；改正時回寫關懷表與／或直 KEY，並同步索引列
- GAS API＋Next API＋UI

### Out of scope

- 改正關懷表問卷全文／住址明細 bulk
- 強制重算全區（可提示使用者）

## Acceptance Criteria

- [ ] 可切換三來源並篩選／勾選／套用改正
- [ ] 關懷表改正寫入 answers_json（及 visit_result）
- [ ] 分桶索引改正會回寫有關懷表／直 KEY 的來源，並更新索引欄
- [ ] typecheck 通過；GAS deploy

## Likely Files

- `components/manage/mohw-progress-corrections.tsx`
- `gas/src/modules/ProgressCorrectionModule.gs`（新）
- `gas/src/ApiRouter.gs`、`lib/gas-client.ts`
- `app/api/manager/progress-corrections/*`

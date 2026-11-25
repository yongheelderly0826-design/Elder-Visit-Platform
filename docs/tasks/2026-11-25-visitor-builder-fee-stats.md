# Task Brief: 訪查員建檔計費統計

## Goal

管理者可依訪查員／建檔人員查詢件數與試算費用；費率來自 Google Sheet「計費參數」，改單價免部署。

## Scope

### In scope

- `/manager/worker-fee-stats` 統計頁（訪查員／建檔／稽核）
- GAS `FeeRateConfig` + `WorkerFeeStatsModule`；種子「計費參數」
- 官方簡表費率、社政＋民政各發、建檔費只給建檔人、稽核費受款人可設定
- Soft-warn：獨訪 250／共同（雙側）500

### Out of scope

- Phase 2b 設定表單 UI、CSV／payment batch 快照（Phase 3）
- 日期欄多選篩選（後續）
- 志工車馬費

## Relevant References

- `docs/plans/visitor-builder-fee-stats-plan.md`

## Likely Files

- `lib/domain/fee-rate-card.ts`
- `gas/src/modules/FeeRateConfig.gs` / `WorkerFeeStatsModule.gs`
- `components/manage/worker-fee-stats-dashboard.tsx`
- `app/manager/worker-fee-stats/page.tsx`

## Acceptance Criteria

- [ ] 管理者選單可見「訪查員／建檔計費統計」
- [ ] 頁面顯示每人件數與三線費用試算
- [ ] Sheet「計費參數」種子後可調價免 redeploy（GAS 已部署）
- [ ] typecheck／lint 通過

## User-Facing Impact

- Visible UI impact expected.

## Closeout

- Deploy GAS after merge
- 個案進度「強制重算」以更新索引 staff 欄（若尚未）

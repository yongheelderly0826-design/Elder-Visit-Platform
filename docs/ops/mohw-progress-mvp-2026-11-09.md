# 衛福部進度回報 MVP（2026-11-09）

## 用途

已直接 KEY 入衛福部平台、本系統沒有關懷表統計時，於獨立頁回報里別進度。

- 路由：`/desk/mohw-progress`
- Sheets：`MOHW進度回報`、`MOHW進度個案標記`
- GAS：`mohwProgress.submit` / `list` / `listMarks` / `listCaseContext` / `summary`
- `source = MOHW直KEY`；**不寫** `關懷表登打`
- **名單過濾：** 只列尚未有本平台 eligible 關懷表（`VisitRecordIndex.ELIGIBLE`＝已提交／已稽核）的個案；草稿／作廢仍可能出現

## 試用

1. 承辦／有 `visits.submit` 的 desk 帳號登入 `/yonghe`（或示範 `manager@eldervisit.org`）
2. 開啟 `/desk/mohw-progress`（訪查員 role 目前會導向 `/visitor/home`，仍走 desk）
3. 選里 → 橫列下拉選「民政訪查員」「社政訪查員」（訪查員主檔，依 civil/social 分欄）
4. 確認「未建檔／名冊／已建檔排除」→ 橫列勾選「已完成／未遇／查無此人」→ 送出
5. Sheets `MOHW進度回報`／`MOHW進度個案標記` 應寫入 `civil_worker_*`／`social_worker_*`

## Phase 2（未做）

`/manager/mohw-progress` 儀表板：總人數＋各里 已完成／未遇／查無此人／尚未完成。

# 衛福部進度回報 MVP（2026-11-09）

## 用途

已直接 KEY 入衛福部平台、本系統沒有關懷表統計時，於獨立頁回報里別進度。

- 路由：`/desk/mohw-progress`
- Sheets：`MOHW進度回報`、`MOHW進度個案標記`
- GAS：`mohwProgress.submit` / `list` / `summary`
- `source = MOHW直KEY`；**不寫** `關懷表登打`

## 試用

1. 承辦登入 `/yonghe`（或示範 `manager@eldervisit.org`）
2. 開啟 `/desk/mohw-progress`
3. 選里 → 手填「已完成／未遇／查無此人」人數 → 送出

## Phase 2（未做）

`/manager/mohw-progress` 儀表板：總人數＋各里 已完成／未遇／查無此人／尚未完成。

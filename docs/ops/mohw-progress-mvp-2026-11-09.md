# 衛福部進度回報 MVP（2026-11-09）

## 用途

已直接 KEY 入衛福部平台、本系統沒有關懷表統計時，於獨立頁回報里別進度。

- 路由：`/desk/mohw-progress`
- Sheets：`MOHW進度回報`、`MOHW進度個案標記`
- GAS：`mohwProgress.submit` / `list` / `listMarks` / `listCaseContext` / `summary`
- `source = MOHW直KEY`；**不寫** `關懷表登打`
- **名單過濾：** 只列尚未有本平台 eligible 關懷表（`VisitRecordIndex.ELIGIBLE`＝已提交／已稽核）的個案；草稿／作廢仍可能出現

## 試用

1. 承辦登入 `/yonghe`（或示範 `manager@eldervisit.org`）
2. 開啟 `/desk/mohw-progress`
3. 選里 → 確認頂部「未建檔／名冊／已建檔排除」→ 在列上勾選「已完成／未遇／查無此人」→ 送出
4. 每列個案名下方應見標籤列：訪查／建檔／稽核（未建檔列後兩者多為 —）

## Phase 2（未做）

`/manager/mohw-progress` 儀表板：總人數＋各里 已完成／未遇／查無此人／尚未完成。

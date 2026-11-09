# 衛福部進度回報 MVP（2026-11-09）

## 用途

已直接 KEY 入衛福部平台、本系統沒有關懷表統計時，於獨立頁回報里別進度；勾選結果匯總至各里儀表板。

- 回報路由：`/desk/mohw-progress`
- 儀表板：`/manager/mohw-progress`
- Sheets：`MOHW進度回報`、`MOHW進度個案標記`
- GAS：`mohwProgress.submit` / `list` / `listMarks` / `listCaseContext` / `summary`
- `source = MOHW直KEY`；**不寫** `關懷表登打`

## 個案兩頁籤（合計＝全里名冊）

1. **已KEY關懷表**：本平台 eligible（已提交／已稽核）— 唯讀，儀表板計入「本系統已KEY／已完成進度」
2. **已直KEY衛福部**：其餘個案 — 需勾已完成／未遇／拒訪並送出（舊標記「查無此人」視為拒訪）

草稿／作廢仍可能出現在直 KEY 頁籤。

## 儀表板公式

- `platform_keyed`＝eligible 關懷表人數
- `direct_*`＝直 KEY 標記（排除已 KEY 關懷表個案，避免重複）
- `reported`＝platform_keyed ∪ 直 KEY 有狀態（去重）
- `completion_rate`＝reported／roster_total

## 試用

1. 承辦／有 `visits.submit` 的 desk 帳號登入 `/yonghe`（或示範 `manager@eldervisit.org`）
2. 開啟 `/desk/mohw-progress`
3. 選里 → 橫列下拉選「民政訪查員」「社政訪查員」
4. 預設「已直KEY衛福部」頁籤勾狀態 → 送出
5. 開啟 `/manager/mohw-progress` 看各里完成率

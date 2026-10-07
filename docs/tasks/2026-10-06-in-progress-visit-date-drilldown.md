# Task Brief: 訪視中依進行中個案日期分層

## Goal

管理者點工作流「訪視中」後，以進行中個案為唯一來源，依「日期 → 訪員 → 個案進度」分層檢視，且各日案數加總對齊工作流數字。

## Scope

### In scope

- 新增 in-progress board domain／API
- `/manager/daily-visits` 改為三層 UI（排序規則如議定）
- 無訪員歸「未指定訪員」

### Out of scope

- 不改工作流計數公式本身
- 不重做每日 Excel 匯出口徑（僅在有日期＋有訪員時保留入口）

## Acceptance Criteria

- [x] 第一層為進行中個案依日期分桶（逾期→今天→未來→未排程）
- [x] 第二層訪員：未指定置頂，再依未完成數
- [x] 第三層個案：未簽到→關懷表未完成→待稽核
- [x] 頁面註明加總＝工作流「訪視中」
- [x] `npm run typecheck` / `lint`

## Verification

- [x] `npm run typecheck`
- [x] `npm run lint`

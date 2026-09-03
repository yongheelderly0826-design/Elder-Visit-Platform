# 衛福部生活關懷表 — Phase 3 欄位驗證

> 對齊中央系統匯入錯誤格式，例如：`I3 身分證號碼格式不正確`

## 模組

| 檔案 | 用途 |
|------|------|
| `lib/domain/mohw-life-care-validation.ts` | 前端／API 驗證（check digit、條件必填、儲存格座標） |
| `gas/src/utils/MohwLifeCareValidator.gs` | GAS 端同規則驗證 |
| `gas/src/modules/CareFormModule.gs` | `submit` 前驗證；新增 `careform.validate` |
| `gas/src/modules/ExportModule.gs` | 匯出前批次驗證（預設 `strict=true`） |

## 錯誤格式

```text
I3 身分證號碼格式不正確
AD2 住宅類型=其他時必須填寫其他說明
A2 訪查日期為必填
```

- 欄位字母：A=訪查日期 … I=身分證字號 …（與 102 欄範本第 1 列對齊）
- 列號：表頭為第 1 列，資料列由第 2 列起

## 主要規則

1. **身分證 check digit**（`national_id`／社政／民政訪查人）
2. **條件必填**（例如住宅類型=其他 → 其他說明；重聽=是 → 佩戴助聽器）
3. **電話／手機擇一必填**
4. **社政／民政訪查人擇一必填**
5. **訪視狀態**非「已完成」時略過問卷區（住宅類型～安全問題）
6. **日期／時間格式**、多選 `;` 分隔、備註／其他 ≤ 200 字

## 使用

```ts
import { validateMohwLifeCareRow } from "@/lib/domain/mohw-life-care-validation";

const result = validateMohwLifeCareRow(answers, { row: 2 });
// result.errorLines → ["I2 身分證號碼格式不正確", ...]
```

GAS：

```
action=careform.validate
body: { answers: {...}, row: 2 }
```

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

## 匯入範本檢核（2026-10-08）

對照 `sheets/templates/生活關懷表匯入範本.xlsx`。有傳入個案身分證時，下面每一筆都要過，否則不能送出、不能核准、不能匯出。

| 儲存格 | 條件 | 錯誤 |
|---|---|---|
| H、A、CT、CY | 必須能轉成文字民國年 `yyy/MM/dd`（例如 `048/06/15`、`113/06/15`）。匯出檔這些欄以文字儲存格寫入 | `H2 日期格式錯誤:此欄需為文字格式並填民國年…` |
| T、Z | 村里必須存在於該縣市＋鄉鎮區（範本 `_lookups`） | `T2 戶籍村里「新星里」在「永和區」下查無此里` |
| BN | 「求助對象-無的複選選項」沒有「其他」時，說明必須空白 | `BN2 未勾選「其他」時，「求助對象無-其他說明」應留空` |
| I | 身分證必須與個案名冊相同且非空 | `I2 無個案資料` |
| CP | 103 欄表頭必須與範本逐字相同（含訪查人欄順序） | `CP2 訪查人欄位順序不符，請重新下載最新版匯入範本` |

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

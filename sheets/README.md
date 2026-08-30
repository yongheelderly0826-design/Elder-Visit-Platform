# Google Sheets 範本

此目錄存放試算表結構範本，供初始化與匯入使用。

## 檔案

| 檔案 | 對應 Tab |
|------|----------|
| `settings.csv` | `_設定` |
| `visitors.csv` | `訪查員主檔` |
| `cases.csv` | `個案名冊` |
| `assignments.csv` | `派案紀錄` |
| `attendance.csv` | `簽到退紀錄` |
| `careforms.csv` | `關懷表登打` |
| `audit.csv` | `稽核佇列` |
| `payments.csv` | `車馬費核銷` |
| `exports.csv` | `匯出紀錄` |

## 使用方式

1. 建立新 Google 試算表
2. 依序新增 Tab，將各 CSV 第一列貼為英文 key 列
3. 第二列貼中文標題（見 `docs/sheets/schema-overview.md`）
4. 在 GAS `Config.gs` 填入 Spreadsheet ID

## 測試資料

永和區 60 筆測試個案匯入格式參考：
- 英文欄位：`external_id`, `case_type`, `name`, `id_number`, `visit_district`, `visit_village`, `primary_phone`, `secondary_phone`, `contact_note`, `visit_status`, `dispatch_priority`, `data_quality_tag`
- 詳見 `docs/tasks/2026-06-21-elder-case-60-import.md`

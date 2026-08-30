# Google Sheets 欄位定義總覽

> 工作簿名稱建議：`永和區_115年_獨居長者訪查_主檔`  
> 命名規則：第 1 列 = 英文 key（GAS 用），第 2 列 = 中文標題（承辦人看）

---

## 工作表一覽

| Tab 名稱 | 主鍵 | 說明 |
|----------|------|------|
| `_設定` | `key` | 工作區參數 |
| `訪查員主檔` | `visitor_id` | 訪查員基本資料 |
| `個案名冊` | `case_id` | 獨老/中老個案 |
| `派案紀錄` | `assignment_id` | 派案與狀態 |
| `簽到退紀錄` | `attendance_id` | 簽到/簽退 |
| `關懷表登打` | `careform_id` | 去識別化表單答案 |
| `空訪紀錄` | `missed_visit_id` | 未遇紀錄 |
| `稽核佇列` | `audit_id` | 覆核 |
| `車馬費核銷` | `payment_id` | 費用 |
| `匯出紀錄` | `export_id` | 衛福部匯出 log |
| `報表快照` | `snapshot_id` | KPI 快取 |
| `_操作日誌` | `log_id` | 系統 log |

---

## `_設定`

| key | value | 說明 |
|-----|-------|------|
| workspace_id | WS-YH-115 | 工作區 ID |
| district | 永和區 | 行政區 |
| fiscal_year | 115 | 年度 |
| encode_prefix | YH-115 | 去識別化前綴 |
| mohw_account | （遮罩） | 衛福部平台帳號 |
| gas_version | 1.0.0 | GAS 版本 |

---

## `訪查員主檔`

| 英文 key | 中文 | 型別 | 必填 | 說明 |
|----------|------|------|------|------|
| visitor_id | 訪查員編號 | text | ✅ | V-YH-001 |
| name | 姓名 | text | ✅ | |
| id_number | 身分證 | text | ✅ | 加密或遮罩 |
| phone | 手機 | text | ✅ | |
| email | Email | text | | |
| service_areas | 服務里別 | text | | 逗號分隔 |
| status | 狀態 | enum | ✅ | 待審/已核准/停用 |
| badge_no | 證件編號 | text | | |
| photo_url | 照片 | url | | Drive 連結 |
| bank_account | 匯款帳號 | text | | 車馬費用 |
| registered_at | 建檔日 | date | | |
| approved_at | 核准日 | date | | |
| updated_at | 更新時間 | datetime | | |

---

## `個案名冊`

| 英文 key | 中文 | 型別 | 必填 | 說明 |
|----------|------|------|------|------|
| case_id | 案號 | text | ✅ | CASE-YH-001 |
| external_id | 外部編號 | text | | DL-001 / ZL-001 |
| case_type | 類型 | enum | ✅ | 獨老/中老 |
| name | 姓名 | text | ✅ | |
| id_number | 身分證 | text | ✅ | |
| gender | 性別 | enum | | |
| birth_date | 出生日期 | date | | |
| age | 年齡 | number | | |
| household_district | 戶籍行政區 | text | | |
| household_village | 戶籍里 | text | | |
| visit_district | 訪視行政區 | text | ✅ | |
| visit_village | 訪視里 | text | ✅ | |
| address | 地址 | text | | |
| primary_phone | 主要電話 | text | | |
| secondary_phone | 備用電話 | text | | |
| contact_note | 聯絡人備註 | text | | |
| visit_status | 訪視狀態 | enum | ✅ | 待訪/已完成/空訪 |
| dispatch_priority | 派案優先 | enum | | 高/中/低 |
| encoded_id | 去識別化編碼 | text | | YH-115-A001 |
| data_quality_tag | 資料品質 | text | | |
| imported_at | 匯入時間 | datetime | | |
| updated_at | 更新時間 | datetime | | |

---

## `派案紀錄`

| 英文 key | 中文 | 型別 | 必填 | 說明 |
|----------|------|------|------|------|
| assignment_id | 派案編號 | text | ✅ | ASG-2026-001 |
| batch_id | 批次 | text | | |
| case_id | 案號 | text | ✅ | FK → 個案名冊 |
| encoded_id | 編碼 | text | ✅ | 訪查員只看此 |
| visitor_id | 訪查員 | text | ✅ | FK → 訪查員主檔 |
| visit_village | 訪視里 | text | | |
| status | 狀態 | enum | ✅ | 待接案/進行中/已完成/空訪/退回 |
| dispatched_at | 派案時間 | datetime | | |
| confirmed_at | 接案時間 | datetime | | |
| due_date | 期限 | date | | |
| notes | 備註 | text | | |
| updated_at | 更新時間 | datetime | | |

---

## `簽到退紀錄`

| 英文 key | 中文 | 型別 | 必填 | 說明 |
|----------|------|------|------|------|
| attendance_id | 紀錄編號 | text | ✅ | |
| visitor_id | 訪查員 | text | ✅ | |
| assignment_id | 派案 | text | | |
| session_date | 日期 | date | ✅ | |
| checkin_at | 簽到時間 | datetime | | |
| checkout_at | 簽退時間 | datetime | | |
| checkin_lat | 簽到緯度 | number | | |
| checkin_lng | 簽到經度 | number | | |
| checkout_lat | 簽退緯度 | number | | |
| checkout_lng | 簽退經度 | number | | |
| session_type | 類型 | enum | | 視訊/現場 |
| duration_minutes | 時數(分) | number | | 自動計算 |

---

## `關懷表登打`

| 英文 key | 中文 | 型別 | 必填 | 說明 |
|----------|------|------|------|------|
| careform_id | 表單編號 | text | ✅ | |
| assignment_id | 派案 | text | ✅ | |
| encoded_id | 編碼 | text | ✅ | 不含個資 |
| visitor_id | 訪查員 | text | ✅ | |
| visit_result | 訪視結果 | enum | ✅ | 完成/未遇/拒訪 |
| completion_pct | 完成度 | number | | 0-100 |
| answers_json | 答案JSON | text | ✅ | 五區塊答案 |
| consent_signed | 同意簽署 | boolean | | |
| photo_urls | 照片 | text | | JSON array |
| status | 狀態 | enum | ✅ | 草稿/已提交/已稽核 |
| submitted_at | 提交時間 | datetime | | |
| audited_at | 稽核時間 | datetime | | |

---

## `稽核佇列`

| 英文 key | 中文 | 型別 | 必填 | 說明 |
|----------|------|------|------|------|
| audit_id | 稽核編號 | text | ✅ | |
| careform_id | 表單 | text | ✅ | |
| reviewer | 覆核人 | text | | |
| decision | 決定 | enum | | 通過/退回 |
| reason | 原因 | text | | |
| decided_at | 決定時間 | datetime | | |

---

## `車馬費核銷`

| 英文 key | 中文 | 型別 | 必填 | 說明 |
|----------|------|------|------|------|
| payment_id | 核銷編號 | text | ✅ | |
| visitor_id | 訪查員 | text | ✅ | |
| period | 期間 | text | | 115-Q1 |
| visit_count | 訪視件數 | number | | |
| total_hours | 總時數 | number | | |
| amount | 金額 | number | | |
| status | 狀態 | enum | | 待計算/已鎖定/已匯款 |
| locked_at | 鎖定時間 | datetime | | |

---

## `匯出紀錄`

| 英文 key | 中文 | 型別 | 必填 | 說明 |
|----------|------|------|------|------|
| export_id | 匯出編號 | text | ✅ | |
| export_type | 類型 | enum | | mohw_life_care |
| case_count | 件數 | number | | |
| file_url | 檔案 | url | | Drive 連結 |
| exported_by | 匯出人 | text | | |
| exported_at | 匯出時間 | datetime | | |

---

## 欄位範本 CSV

各表第一列英文 key 範本位於 [`../../sheets/templates/`](../../sheets/templates/)。

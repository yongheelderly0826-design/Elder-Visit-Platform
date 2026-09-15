## 訪員註冊與 Email 密碼帳號

GAS/Google Sheets 是預設使用者後端；Supabase 環境變數可全部留空。`initAllSheets()` 會建立
`訪員註冊申請` 與 `訪員帳號`。核准申請時會同步建立或更新 `訪查員主檔` 與帳號。

- `registrations.list|get|create|review|batchReview`
- `accounts.getAuthByEmail|issueToken|setPassword|markLogin`

密碼由 Next.js 使用 Node `crypto.scrypt` 雜湊；Sheet 只保存 hash、salt 與參數。邀請與重設
token 使用 32-byte 隨機值，Sheet 只保存 SHA-256 hash，30 分鐘過期且設定密碼後一次性清除。
GAS 不使用 `MailApp`；管理者從後台複製一次性 URL，安全交給訪員。

# GAS Web App API 規格

Base URL：`https://script.google.com/macros/s/{DEPLOYMENT_ID}/exec`

所有請求需帶 Header：
```
Authorization: Bearer {WORKSPACE_API_TOKEN}
X-Workspace-Id: WS-YH-115
```

回應格式：
```json
{
  "ok": true,
  "data": { ... },
  "error": null
}
```

錯誤時：
```json
{
  "ok": false,
  "data": null,
  "error": { "code": "VALIDATION_ERROR", "message": "..." }
}
```

---

## 訪查員 Visitor

| Method | Path | 說明 |
|--------|------|------|
| GET | `?action=visitors.list` | 列表 |
| GET | `?action=visitors.get&id={visitor_id}` | 單筆 |
| GET | `?action=visitors.getByIdNumber&id_number=` | 依身分證查詢 |
| POST | `?action=visitors.create` | 新增（可含 `volunteer_group`） |
| POST | `?action=visitors.update` | 更新（寫回 Sheet） |
| POST | `?action=visitors.approve` | 核准發證 |

## 個案 Case

| Method | Path | 說明 |
|--------|------|------|
| GET | `?action=cases.list&district=永和區` | 名冊 |
| GET | `?action=cases.get&id={case_id}` | 單筆（管理端） |
| GET | `?action=cases.getEncoded&code={encoded_id}` | 編碼查詢（訪查員端） |
| POST | `?action=cases.import` | 批次匯入 |

## 派案 Assignment

| Method | Path | 說明 |
|--------|------|------|
| GET | `?action=assignments.list&visitor_id={id}` | 訪查員任務 |
| POST | `?action=assignments.dispatch` | 建立派案 |
| POST | `?action=assignments.confirm` | 訪查員接案 |

## 簽到退 Attendance（志工出勤＋訪查到宅）

| Method | Path | 說明 |
|--------|------|------|
| POST | `?action=attendance.identify` | 身分證確認身分＋組別 |
| GET | `?action=attendance.status&visitor_id=` | 當日是否已簽到未簽退（可帶 `session_type`、`assignment_id`） |
| POST | `?action=attendance.clock` | 切換簽到／簽退（寫回 Sheet） |
| POST | `?action=attendance.checkin` | 僅簽到 |
| POST | `?action=attendance.checkout` | 僅簽退（計算時數） |
| GET | `?action=attendance.list&period=yyyy-MM` | 月出勤列表（可 `session_type`） |
| POST | `?action=attendance.monthlyExport` | 月結 xlsx → Drive（**僅志工出勤**） |
| GET | `?action=attendance.catalog` | 12 組與集合點清單 |

外勤集合點 `clock` body：

```json
{
  "visitor_id": "V-YH-MEAL01",
  "site_id": "SITE-MEAL",
  "channel": "qr",
  "source": "field_qr",
  "session_type": "志工出勤"
}
```

公所刷身分證：`id_number` + `channel: "barcode"` + `source: "office_kiosk"`。  
公所掃個人 QR：`visitor_id`（由前端解析 `EVVOL:V-…`）+ `channel: "badge_qr"` + `source: "office_kiosk"`。  
訪查到宅：`assignment_id` + `session_type: "訪查"` + `channel: "gps"` + `source: "visit"`。

前端輔助：

| 路徑 | 說明 |
|------|------|
| `/volunteer/clock` | 外勤掃集合點 QR |
| `/volunteer/badge` | 志工出示個人 QR（`EVVOL:…`） |
| `/office/kiosk` | 櫃台掃槍（身分證或個人 QR） |
| `/api/attendance/badge-qr` | 產生個人 QR 圖 |
| `/api/visits/clock` | 綁派案到宅簽到退 |

## 關懷表 Care Form

| Method | Path | 說明 |
|--------|------|------|
| GET | `?action=careform.get&assignment_id={id}` | 讀取草稿/已提交 |
| POST | `?action=careform.saveDraft` | 存草稿 |
| POST | `?action=careform.submit` | 正式提交（並寫入高關懷名冊） |
| POST | `?action=careform.generatePdf` | 將答案填入 Google 試算表母版，輸出單頁直式 A3 PDF 並保存至 Drive |

## 高關懷 High Care

| Method | Path | 說明 |
|--------|------|------|
| GET | `?action=highcare.list` | 名冊（可 color／status） |
| GET | `?action=highcare.stats` | 顏色與狀態件數 |
| POST | `?action=highcare.update` | 更新追蹤狀態 |

## 稽核 Audit

| Method | Path | 說明 |
|--------|------|------|
| GET | `?action=audit.queue` | 待覆核列表 |
| POST | `?action=audit.decide` | 通過/退回 |

## 匯出 Export

| Method | Path | 說明 |
|--------|------|------|
| POST | `?action=export.lifeCareXlsx` | 衛福部生活關懷表 |
| GET | `?action=export.history` | 匯出紀錄 |

## 報表 Report

| Method | Path | 說明 |
|--------|------|------|
| GET | `?action=reports.kpi&period=115-Q1` | KPI 快照 |
| GET | `?action=reports.dispatchSummary` | 派案完成率 |
| GET | `?action=reports.dailyVisitBundle&date=YYYY-MM-DD` | 每日訪視統計一次回傳（派案、訪員、個案、出勤、稽核、關懷表摘要） |
| GET | `?action=assignments.visitorTasksBundle&visitor_id=&active_only=true` | 訪員任務一次回傳（進行中派案＋對應個案＋訪視次數） |

## 車馬費 Payment

| Method | Path | 說明 |
|--------|------|------|
| POST | `?action=payments.calculate` | 計算 |
| POST | `?action=payments.lock` | 鎖定批次 |

---

## POST Body 範例

### careform.submit

```json
{
  "assignment_id": "ASG-2026-001",
  "visitor_id": "V-YH-001",
  "encoded_case_id": "YH-115-A001",
  "visit_result": "完成訪視",
  "answers": {
    "section1": { "living_alone": "是", "..." : "..." },
    "section2": { },
    "section3": { },
    "section4": { },
    "section5": { }
  },
  "photos": [],
  "consent_signed": true,
  "submitted_at": "2026-08-30T15:00:00+08:00"
}
```

### export.lifeCareXlsx

```json
{
  "batch_id": "EXP-2026-001",
  "case_ids": ["CASE-001", "CASE-002"],
  "export_format": "mohw_life_care_v115"
}
```

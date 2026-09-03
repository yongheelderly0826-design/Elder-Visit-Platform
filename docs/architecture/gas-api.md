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

## 簽到退 Attendance（12 組志工出勤）

| Method | Path | 說明 |
|--------|------|------|
| POST | `?action=attendance.identify` | 身分證確認身分＋組別 |
| GET | `?action=attendance.status&visitor_id=` | 當日是否已簽到未簽退 |
| POST | `?action=attendance.clock` | 切換簽到／簽退（寫回 Sheet） |
| POST | `?action=attendance.checkin` | 僅簽到 |
| POST | `?action=attendance.checkout` | 僅簽退（計算時數） |
| GET | `?action=attendance.list&period=yyyy-MM` | 月出勤列表 |
| POST | `?action=attendance.monthlyExport` | 月結 xlsx → Drive |
| GET | `?action=attendance.catalog` | 12 組與集合點清單 |

`clock` body 範例：

```json
{
  "visitor_id": "V-YH-MEAL01",
  "site_id": "SITE-MEAL",
  "channel": "qr",
  "source": "field_qr"
}
```

公所刷證改傳 `id_number` + `channel: "barcode"` + `source: "office_kiosk"`。

## 關懷表 Care Form

| Method | Path | 說明 |
|--------|------|------|
| GET | `?action=careform.get&assignment_id={id}` | 讀取草稿/已提交 |
| POST | `?action=careform.saveDraft` | 存草稿 |
| POST | `?action=careform.submit` | 正式提交 |

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

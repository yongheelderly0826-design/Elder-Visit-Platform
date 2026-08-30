# 資料流與同步策略

## 1. 讀寫路徑

### 訪查員提交關懷表

```
訪查員 PWA (/visitor/visits/[id])
    │ POST /api/visits/submit  (Next.js API Route)
    │ 或直連 GAS Web App
    ▼
GAS CareFormModule.submit()
    ├── Validation.gs 檢核必填
    ├── 寫入「關懷表登打」Sheet
    ├── 更新「派案紀錄」狀態 → 已完成
    └── 追加「_操作日誌」
    ▼
（選用）Next.js 回傳成功 + 完成度
```

### 承辦匯入個案名冊

```
承辦上傳 xlsx (/manager/import)
    ▼
Next.js /api/import/preview → 預覽
    ▼
GAS CaseModule.importBatch()
    ├── 解析列資料
    ├── 身分證檢查碼驗證
    ├── 去重（external_id）
    └── 批次寫入「個案名冊」
```

### 衛福部 xlsx 匯出

```
承辦按「匯出」(/manager/exports)
    ▼
GAS ExportModule.exportLifeCareXlsx()
    ├── 讀取「關懷表登打」+「個案名冊」（join by case_id）
    ├── 對照官方 102 欄範本
    ├── 產生 .xlsx → Google Drive 暫存
    └── 回傳下載連結 + 寫入「匯出紀錄」
```

---

## 2. 快取策略

| 資料 | 快取位置 | TTL | 更新方式 |
|------|---------|-----|----------|
| 訪查員主檔 | GAS CacheService | 5 min | 寫入時失效 |
| KPI 報表 | `報表快照` Sheet | 每日 | 定時觸發 06:00 |
| 個案名冊 | 不 cache | — | 即時讀 Sheet |
| 派案列表 | Next.js SWR | 30 sec | 訪查員端 |

---

## 3. 離線草稿（PWA）

訪查員離線時：
1. 關懷表答案存 `localStorage`（現有 `/visitor/drafts`）
2. 恢復連線後批次 POST 至 GAS
3. GAS 以 `draft_id` 去重，避免重複提交

---

## 4. 衝突處理

| 情境 | 策略 |
|------|------|
| 同時編輯同一列 | Sheet 最後寫入為準；GAS 寫入前讀 `updated_at` |
| 重複派案 | `assignment_id` 唯一鍵拒絕 |
| 重複簽到 | 同 `visitor_id` + `date` 僅允許一筆簽到 |

---

## 5. Phase 2：Supabase 同步（選用）

若未來遷移至 Supabase：

```
Google Sheets  ◄──GAS SyncJob（每 15 min）──►  Supabase PostgreSQL
                      │
                      └── 以 Sheets 為 master，
                          Supabase 為 read replica
```

同步鍵：`workspace_id` + 各表主鍵。

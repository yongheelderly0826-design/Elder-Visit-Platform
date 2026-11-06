# 社政單位收斂為「志工」（2026-11-06）

## 決策

- 必改單位字串（協會／公司／雜訊）→ **志工**
- 社政卻掛「民政課」的 9 人 → **單位改志工**（人仍留 `social_affairs`）
- **社會人文課**保留（主檔 `department` 已是社會人文課者不改；空白但 `service_areas` 含社會人文課者對齊填入社會人文課）

## 影響表／欄位

| 表 | 欄位 | 變更 |
| --- | --- | --- |
| 訪查員主檔 | `department` | → 志工（或對齊社會人文課） |
| 訪查員主檔 | `service_areas` | 含協會／民政課 → `永和區公所志工` |
| 訪員註冊申請 | profile `departmentName`／`departmentOther` | → 志工／清空 other；重算 `displayName` |

未動：職稱、`volunteer_group`、關懷表、稽核、里責任 org。

## 結果（已套用）

| 範圍 | 成功 | 失敗 | 略過 |
| --- | ---: | ---: | --- |
| 訪查員主檔 | 51 | 0 | — |
| 訪員註冊申請 | 33 | 0 | 黃淑美（無 `visitor_id`，單位仍為「其他」） |

詳見 `social-dept-to-volunteer-apply-2026-11-06.json`、`social-dept-to-volunteer-plan-2026-11-06.json`。

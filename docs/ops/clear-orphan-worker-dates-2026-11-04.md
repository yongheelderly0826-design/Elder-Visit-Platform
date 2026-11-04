# 清除有日無名之社政／民政日期（2026-11-04）

## 規則
- 範圍：關懷表狀態 `已提交`／`已稽核`
- `social_worker_date` 非空且 `social_worker_name` 空 → 清空 date
- `civil_worker_date` 非空且 `civil_worker_name` 空 → 清空 date
- **只改 date**；不動 name／phone／national_id／role／其他欄
- 有 name 的側：date 絕不清

## 作法
1. `ops.scanMissingWorkerWithTime`（`include_clear_plan`）確認待清筆數
2. Smoke：`ops.patchCareformAnswers` apply 5 筆 + `ops.peekCareformsByIds`
3. 全速：`ops.clearOrphanWorkerDates`（一次掃寫，避免 `patchCareformAnswers` 每批重寫整欄逾時）
4. 清後再 scan／peek 驗收

腳本：`scripts/ops-clear-orphan-worker-dates.mjs`  
GAS：`ops.clearOrphanWorkerDates`（deploy @143）

## 清除結果

| 項目 | 數量 |
| --- | ---: |
| 社政 date 清除 | 692 |
| 民政 date 清除 | 748（smoke 5 + 全速 743） |
| 關懷表觸及 | 1440（smoke 5 + 全速 1435） |
| 寫入失敗／missing | 0 |
| skipped_named_guard | 0 |

## 清前／清後矩陣（已提交＋已稽核）

| 指標 | 清前 | 清後 |
| --- | ---: | ---: |
| social `date_no_name` | 692 | **0** |
| civil `date_no_name` | 748 | **0** |
| union anomaly forms | 1440 | **0** |
| social `name_and_date` | 1376 | 1376 |
| civil `name_and_date` | 1149 | 1149 |
| `either_name_and_date` | 2209 | 2209 |

有名側名日完整數不變；擇一完整 2209 不變。

## 抽樣
- Smoke 5 筆：民政 orphan date 已空；有名社政 date 保留（如高廷峯／黃正昌）。
- 全速後 peek 10 筆：同上，無名側 date 空、有名側 date 保留。

# Task Brief: 個案進度儀表板（含清冊對照）

## 繁體中文說明

這份文件用來在任務開始前先把方向講清楚，避免還沒定義目標就直接進入開發。
請先補完目標、範圍、風險、驗收條件，再決定哪些 Agent 需要參與。

## Goal

主管／承辦以**個案（人）**為母體，一眼看到：名冊多少人、有多少已 KEY 關懷表、多少直 KEY、多少無痕跡、與**衛福清冊全量對照**的落差（含僅清冊／僅系統／兩邊狀態不一致），並可 drill-down 到名單。  
既有 `/manager/mohw-progress`（里別視角）**保留**；新增獨立 `/manager/case-progress`（個案視角），兩邊互相連結。

## Locked decisions（2026-11-22）

1. **「已訪／有紀錄」**＝有 eligible 關懷表 **或** 有直 KEY mark；畫面上**兩者都要分別標示**（不可只顯示合計）。
2. **MVP 含清冊對照（全部）**：以最新匯入的清冊快照（如 1151117）對全系統名冊做身分證比對，不是抽樣。
3. **頁面**：獨立 `/manager/case-progress`；**同時保留** `/manager/mohw-progress`（里別）。導航兩者並列、可互跳。

## Scope

### In scope

- 新頁 `/manager/case-progress`（manager／auditor）
- 區級總覽卡：名冊總數、已 KEY 關懷表、直 KEY、無痕跡、有紀錄合計、系統 visit_status 未完成
- KEY 通道 × visit_status 交叉；落差警示（有 mark 仍待訪、有關懷表狀態未同步）
- **清冊全量對照**：匯入／儲存清冊快照 + 分桶（沿用 ops：A/B/C/D/E/F）
- 明細表（遮罩）＋里／通道／清冊狀態篩選
- GAS 聚合 API + Next API route
- 導航與 mohw-progress 互連

### Out of scope

- 不取代 desk 直 KEY 作業頁
- 不自動「證明」衛福後台已 KEY 成功（mark 仍為 proxy）
- 不在本任務改 visit_status 回寫邏輯（僅呈現落差）
- PWA／icon 變更

## Relevant References

- `docs/ops/roster-1151117-key-channel-analysis-2026-11-20.md`（分桶口徑）
- `docs/ops/roster-mohw-keyed-but-unvisited-2026-11-21.md`
- `docs/ops/mohw-progress-mvp-2026-11-09.md`
- `docs/sheets/schema-overview.md`
- `components/manage/mohw-progress-dashboard.tsx`
- `gas/src/modules/MohwProgressModule.gs`

## Likely Files

- `app/manager/case-progress/page.tsx`
- `components/manage/case-progress-dashboard.tsx`
- `app/api/manager/case-progress/summary/route.ts`（+ roster import／list if needed）
- `lib/domain/case-progress.ts`
- `lib/domain/navigation.ts`
- `gas/src/modules/CaseProgressModule.gs`（或擴充 MohwProgress）
- `docs/sheets/schema-overview.md`（清冊快照表）
- `scripts/` 清冊匯入腳本（可從 1151117 xlsx）

## Risks / Ambiguities

- 清冊 ~1.6 萬列 + 名冊 ~7 千：GAS 即時全量 join 可能逾時 → 需快照表＋預聚合／分頁
- 清冊含個資：Sheets 權限與勿 commit xlsx
- 「直 KEY」≠ 衛福後台成功；UI 需標註 proxy
- 清冊版本更新流程（誰上傳、何時覆蓋）

## User-Facing Impact

- Visible UI impact expected（新儀表板＋導航）

## Workstreams

| Owner | Task | Write Scope | Expected Output |
| --- | --- | --- | --- |
| Planner / Lead | 鎖定指標與清冊快照架構 | 本 brief | 已定案規格 |
| Builder | GAS 快照＋summary API＋前端儀表板 | gas/、app/、components/、lib/ | 可開的 `/manager/case-progress` |
| Design / UX Agent | 總覽卡層級、通道標籤、落差警示可讀性 | UI | UX 過關 |
| Reviewer / QA | 分桶數字對齊 ops 報告量級；遮罩個資 | Diff + 手動 | QA 紀錄 |
| Release / Ops | GAS deploy + 清冊首次匯入 | gas deploy、Sheets | 上線說明 |

## Acceptance Criteria

- [ ] `/manager/case-progress` 可開；manager／auditor 可見
- [ ] 總覽同時標示「已 KEY 關懷表」與「直 KEY」人數（可再看合計「有紀錄」）
- [ ] `/manager/mohw-progress` 仍可用，並有連到個案視角
- [ ] 清冊全量對照分桶可見（A–F 或同等），數字與最新快照一致
- [ ] 明細可篩選且姓名／證號遮罩
- [ ] `npm run typecheck`／`lint`／`build` 通過
- [ ] Design／UX 過關

## Verification

- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm run build`
- [ ] Design / UX review completed
- [ ] 分桶抽樣對照 `docs/ops/roster-1151117-key-channel-analysis-2026-11-20.md`

## Lessons to Capture

- 個案視角 vs 里別視角並存；清冊對照以快照表為準，勿每次讀 xlsx
- 直 KEY mark 為進度 proxy，UI 必須標註

## Completion Notes

- What changed:
  - 新增 `/manager/case-progress`、GAS `CaseProgressModule`（@174）、清冊快照表與匯入腳本
  - 已匯入 SNAP-1151117-20261122（16,776）；summary 快取已寫入
  - `/manager/mohw-progress` 保留並互連
- What was verified:
  - 匯入後 buckets 與 ops 分析量級一致（A 2311／B 2135／C 409／D~1540）
  - `caseProgress.summary` 回傳 careform／direct 分開標示
- What remains undecided:
  - 清冊快照更新節奏（目前：`node scripts/ops-import-roster-snapshot.mjs` 手動覆蓋）
  - Design／UX 正式過關與前端 typecheck／build gate

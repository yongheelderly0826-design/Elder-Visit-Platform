# Task Brief: 訪員快速KEY同頁建檔

## Goal

同一頁支援：（A）已登入訪查員輸入里編碼後從待訪名單點「確認」進關懷表 KEY；（B）尚未建檔者由現場「新增訪查員」後同樣流程。送出後回到待訪名單再點下一案。不做今日路線清單。

## Scope

### In scope

- `/desk/quick-key`（場生／里責：可搜尋＋現場建檔）
- `/visitor/quick-key`（訪員登入：訪查員鎖定本人）
- 里編碼 → 待訪名單（`village_seq` 排序）→ 確認派案 → 關懷表 → return 回名單
- 來源標記：`訪員自領・實訪`

### Out of scope

- 今日路線清單
- 里編碼＋N 一次連領（之後可加）

## Likely Files

- `components/manage/quick-key-panel.tsx`
- `app/desk/quick-key/page.tsx`
- `app/visitor/quick-key/page.tsx`
- `app/api/manager/care-forms/quick-pending/route.ts`
- `lib/domain/desk-care-batch.ts`（實訪 notes）
- `lib/domain/navigation.ts`

## Acceptance Criteria

- 輸入六碼里編碼後出現待訪名單（依里編號）
- 路徑 A：訪員登入後名稱鎖定，確認後可 KEY
- 路徑 B：可現場最小建檔訪查員後確認 KEY
- 別人進行中派案不可搶；確認後進表，送出可回名單

## Verification

- [ ] `npm run typecheck`
- [ ] Design / UX review completed

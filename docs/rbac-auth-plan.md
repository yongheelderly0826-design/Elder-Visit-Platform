# RBAC Auth Plan

## 目標

- 使用者以帳號密碼登入後取得 session。
- session 綁定 account、unit、workspace、role。
- 系統依 role capabilities 決定可見選單、可進入頁面與可操作按鈕。
- 重要操作仍需後端 API 再檢查權限，前端鎖按鈕只作為 UX 提示。

## 示範帳號

| 角色 | Email | Password | 登入後首頁 |
| --- | --- | --- | --- |
| 工作空間擁有者 | owner@eldervisit.org | owner123 | /dashboard |
| 承辦管理者 | manager@eldervisit.org | manager123 | /dashboard |
| 督導 | supervisor@eldervisit.org | supervisor123 | /manager/audit |
| 訪員 | visitor@eldervisit.org | visitor123 | /visitor/home |
| 訪員（Joe） | joe@elder.org | 123456 | /visitor/home |
| 稽核人員 | auditor@eldervisit.org | auditor123 | /manager/audit |
| 唯讀檢視者 | viewer@eldervisit.org | viewer123 | /dashboard |

## 角色規劃

- workspace_owner: 管理所有資料、角色、成員與設定。
- workspace_manager: 管理名冊、派案、稽核、核銷、匯出與設定。
- supervisor: 處理 warning、核准或退回稽核。
- visitor: 只看自己的任務並送出訪查表。
- auditor: 可執行稽核檢查，但不可最終核准。
- viewer: 只能查看總覽與名冊。

## 權限層級

- Navigation: `getVisibleNavItems(capabilities)` 控制可見選單。
- Page: 正式版應在 route middleware 或 server component 檢查 capability。
- Component action: 例如稽核核准、核銷鎖定按鈕依 capability disabled。
- API: 正式版每支 POST / PATCH / DELETE API 都要檢查 session capability。
- Database: Supabase RLS 以 workspace_memberships、workspace_roles、effective_permissions 限制資料讀寫。

## 正式 Supabase 對應

- `accounts`: 對應 Supabase auth user。
- `workspace_memberships`: 使用者在 workspace 的角色。
- `workspace_roles`: role_key 與 capabilities。
- `effective_permissions`: 快取展開後的權限，避免每次查矩陣。
- `workspace_permission_logs`: 記錄角色變更與權限調整。

## 目前實作狀態

- `/login` 已提供示範帳號與密碼。
- `/api/auth/mock-login` 會驗證示範帳號並寫入 `demo_role` cookie。
- `AppShell` 會依 `demo_role` 顯示不同選單。
- `/manager/audit` 的核准與鎖定核銷按鈕已依 capability 啟用或停用。
- `/workspace/permissions` 可查看角色、成員與權限矩陣。

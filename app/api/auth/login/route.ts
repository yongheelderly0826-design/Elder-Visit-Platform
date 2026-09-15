import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { setVolunteerClockCookie, clearVolunteerClockCookie } from "@/lib/attendance/session";
import { SESSION_COOKIE } from "@/lib/auth/google-manager";
import { getDemoVisitorLink } from "@/lib/domain/demo-visitor-link";
import { authenticateDemoAccount, demoLoginAccounts } from "@/lib/domain/permissions";
import { verifyGasPassword } from "@/lib/auth/gas-password";
import { gasClient, isGasConfigured } from "@/lib/gas-client";
import type { WorkspaceRoleKey } from "@/lib/domain/types";

function getSafeNextPath(
  nextPath: string | null,
  fallback: string,
  roleKey?: WorkspaceRoleKey,
) {
  if (!nextPath || !nextPath.startsWith("/") || nextPath.startsWith("//")) {
    return fallback;
  }
  if (roleKey && roleKey !== "visitor" && nextPath.startsWith("/visitor/")) {
    return fallback;
  }
  if (roleKey === "visitor" && (nextPath.startsWith("/manager/") || nextPath.startsWith("/workspace/"))) {
    return fallback;
  }
  return nextPath;
}

function inferRoleKey(email: string): WorkspaceRoleKey {
  const demoAccount = demoLoginAccounts.find(
    (account) => account.email.toLowerCase() === email.toLowerCase(),
  );
  if (demoAccount) {
    return demoAccount.roleKey;
  }

  if (email.includes("visitor")) return "visitor";
  if (email.includes("supervisor")) return "supervisor";
  if (email.includes("auditor")) return "auditor";
  if (email.includes("viewer")) return "viewer";
  if (email.includes("owner")) return "workspace_owner";
  return "workspace_manager";
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    email?: string;
    password?: string;
    next?: string;
    visitorOnly?: boolean;
  };
  const email = body.email ?? "";
  const password = body.password ?? "";
  const demoAccount = authenticateDemoAccount(email, password);

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (!error && data.user) {
      const roleKey = await getSupabaseRoleKey(data.user.id, demoAccount?.roleKey ?? inferRoleKey(email));
      if (body.visitorOnly && roleKey !== "visitor") {
        await supabase.auth.signOut();
        return visitorOnlyError();
      }
      await markSupabaseUserActivated(data.user.id, data.user.email ?? email);
      const response = NextResponse.json({
        data: {
          ok: true,
          mode: "supabase",
          roleKey,
          nextPath: getSafeNextPath(
            body.next ?? null,
            demoAccount?.landingPath ?? getDefaultLandingPath(roleKey),
            roleKey,
          ),
        },
      });

      response.cookies.set("demo_role", roleKey, {
        path: "/",
        sameSite: "lax",
        maxAge: sessionMaxAge(roleKey),
      });
      clearManagerSession(response);
      attachDemoVisitorSession(response, email, demoAccount?.fullName, roleKey);

      return response;
    }
  } catch {
    // Supabase Auth can be unavailable during local setup; demo login remains available.
  }

  if (isGasConfigured()) {
    try {
      const account = await gasClient.accounts.getAuthByEmail(email.trim().toLowerCase());
      if (
        account &&
        account.status === "active" &&
        account.password_hash &&
        (await verifyGasPassword({
          password,
          passwordHash: account.password_hash,
          passwordSalt: account.password_salt,
          passwordParams: account.password_params,
        }))
      ) {
        const roleKey = normalizeRoleKey(account.role_key, "visitor");
        if (body.visitorOnly && roleKey !== "visitor") return visitorOnlyError();
        const response = NextResponse.json({
          data: {
            ok: true,
            mode: "gas",
            roleKey,
            fullName: account.full_name,
            nextPath: getSafeNextPath(
              body.next ?? null,
              getDefaultLandingPath(roleKey),
              roleKey,
            ),
          },
        });
        response.cookies.set("demo_role", roleKey, {
          path: "/",
          sameSite: "lax",
          maxAge: sessionMaxAge(roleKey),
        });
        clearManagerSession(response);
        attachDemoVisitorSession(response, account.email, account.full_name, roleKey, account.visitor_id);
        try {
          await gasClient.accounts.markLogin(account.email);
        } catch {
          // last_login_at 同步失敗不應阻擋已驗證的登入。
        }
        return response;
      }
    } catch {
      // GAS 暫時無法使用時，仍保留既有示範帳號登入。
    }
  }

  if (!demoAccount) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_LOGIN",
          message: "帳號或密碼錯誤，請確認 Email 與密碼。",
        },
      },
      { status: 401 },
    );
  }

  if (body.visitorOnly && demoAccount.roleKey !== "visitor") {
    return visitorOnlyError();
  }

  const response = NextResponse.json({
    data: {
      ok: true,
      mode: "demo",
      roleKey: demoAccount.roleKey,
      fullName: demoAccount.fullName,
      nextPath: getSafeNextPath(body.next ?? null, demoAccount.landingPath, demoAccount.roleKey),
    },
  });

  response.cookies.set("demo_role", demoAccount.roleKey, {
    path: "/",
    sameSite: "lax",
    maxAge: sessionMaxAge(demoAccount.roleKey),
  });
  clearManagerSession(response);
  attachDemoVisitorSession(response, email, demoAccount.fullName, demoAccount.roleKey);

  return response;
}

function attachDemoVisitorSession(
  response: NextResponse,
  email: string,
  fullName?: string,
  roleKey?: WorkspaceRoleKey,
  visitorId?: string,
) {
  const maxAge = sessionMaxAge(roleKey);
  response.cookies.set("demo_email", email.toLowerCase(), {
    path: "/",
    sameSite: "lax",
    maxAge,
  });
  if (fullName) {
    response.cookies.set("demo_name", fullName, {
      path: "/",
      sameSite: "lax",
      maxAge,
    });
  }

  const link = roleKey === "visitor" && !visitorId ? getDemoVisitorLink(email) : null;
  if (visitorId || link?.visitorId) {
    setVolunteerClockCookie(response, visitorId || link!.visitorId);
  } else {
    clearVolunteerClockCookie(response);
  }
}

function sessionMaxAge(roleKey?: WorkspaceRoleKey) {
  return roleKey === "visitor" ? 60 * 60 * 24 * 30 : 60 * 60 * 8;
}

function clearManagerSession(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE, "", {
    path: "/",
    sameSite: "lax",
    maxAge: 0,
  });
}

function visitorOnlyError() {
  return NextResponse.json(
    {
      error: {
        code: "VISITOR_ACCOUNT_REQUIRED",
        message: "此入口僅供訪員登入，管理者請使用管理後台入口。",
      },
    },
    { status: 403 },
  );
}

function getDefaultLandingPath(roleKey: WorkspaceRoleKey) {
  if (roleKey === "visitor") return "/visitor/home";
  if (roleKey === "supervisor" || roleKey === "auditor") return "/manager/audit";
  return "/dashboard";
}

async function markSupabaseUserActivated(authUserId: string, email: string) {
  try {
    const supabase = createAdminClient();
    const now = new Date().toISOString();

    await (supabase as unknown as AccountActivationClient)
      .from("accounts")
      .update({
        auth_user_id: authUserId,
        updated_at: now,
      })
      .eq("email", email);

    await (supabase as unknown as RegistrationActivationClient)
      .from("workspace_registration_requests")
      .update({
        auth_invite_status: "activated",
        auth_activated_at: now,
      })
      .eq("email", email)
      .eq("status", "approved");
  } catch {
    // Login should not fail if activation status sync is temporarily unavailable.
  }
}

type SupabaseRoleClient = {
  from(table: "accounts"): {
    select(query: string): {
      eq(column: string, value: string): {
        maybeSingle(): Promise<{
          data: {
            workspace_memberships:
              | Array<{
                  role_name: string | null;
                  status: string | null;
                }>
              | null;
          } | null;
          error: unknown;
        }>;
      };
    };
  };
};

type AccountActivationClient = {
  from(table: "accounts"): {
    update(row: Record<string, unknown>): {
      eq(column: string, value: string): Promise<{
        data: unknown;
        error: unknown;
      }>;
    };
  };
};

type RegistrationActivationClient = {
  from(table: "workspace_registration_requests"): {
    update(row: Record<string, unknown>): {
      eq(column: string, value: string): {
        eq(column: string, value: string): Promise<{
          data: unknown;
          error: unknown;
        }>;
      };
    };
  };
};

async function getSupabaseRoleKey(authUserId: string, fallback: WorkspaceRoleKey) {
  try {
    const supabase = await createClient();
    const { data, error } = await (supabase as unknown as SupabaseRoleClient)
      .from("accounts")
      .select("workspace_memberships(role_name,status)")
      .eq("auth_user_id", authUserId)
      .maybeSingle();

    if (error || !data?.workspace_memberships?.length) {
      return fallback;
    }

    const activeMembership =
      data.workspace_memberships.find((membership) => membership.status === "active") ??
      data.workspace_memberships[0];

    return normalizeRoleKey(activeMembership.role_name, fallback);
  } catch {
    return fallback;
  }
}

function normalizeRoleKey(roleName: string | null, fallback: WorkspaceRoleKey): WorkspaceRoleKey {
  if (
    roleName === "workspace_owner" ||
    roleName === "workspace_manager" ||
    roleName === "supervisor" ||
    roleName === "visitor" ||
    roleName === "auditor" ||
    roleName === "viewer"
  ) {
    return roleName;
  }

  return fallback;
}

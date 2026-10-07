"use client";

import { useState } from "react";
import { LogOut, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { logout } from "@/lib/auth/browser-session";
import { LOGIN_PATH, type CurrentUser } from "@/lib/auth/session";

const ROLE_LABELS: Record<CurrentUser["role"], string> = {
  ADMIN: "Administrador",
  USER: "Usuario",
};

/** Who is signed in, and the way out. A full navigation drops every cached page. */
export function UserMenu({
  user,
  navigate = (path: string) => window.location.assign(path),
}: {
  user: CurrentUser;
  navigate?: (path: string) => void;
}) {
  const [pending, setPending] = useState(false);

  async function handleLogout() {
    setPending(true);
    await logout();
    navigate(LOGIN_PATH);
  }

  return (
    <div className="flex items-center gap-2 border-t border-sidebar-border px-4 py-3">
      <UserRound className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{user.username}</p>
        <p className="text-xs text-muted-foreground">{ROLE_LABELS[user.role]}</p>
      </div>
      <Button type="button" variant="ghost" size="sm" onClick={handleLogout} disabled={pending}>
        <LogOut />
        Cerrar sesión
      </Button>
    </div>
  );
}

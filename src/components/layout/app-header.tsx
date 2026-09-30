"use client";

import { usePathname } from "next/navigation";
import { Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { NAV_SECTIONS } from "./nav-items";
import { isActive } from "./sidebar";
import { useSidebar } from "./sidebar-provider";

function currentContext(pathname: string): { section: string | null; page: string } | null {
  for (const section of NAV_SECTIONS) {
    for (const link of section.links) {
      if (isActive(pathname, link.href)) {
        return { section: section.label, page: link.label };
      }
    }
  }
  return null;
}

/**
 * Thin contextual bar inside the content column. It owns the navigation
 * controls (mobile drawer, desktop collapse) and states where you are; the
 * page title, description and actions stay in `PageHeader`.
 */
export function AppHeader() {
  const pathname = usePathname();
  const { collapsed, toggleCollapsed, setMobileOpen } = useSidebar();
  const context = currentContext(pathname);
  const CollapseIcon = collapsed ? PanelLeftOpen : PanelLeftClose;

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background px-3 md:px-4">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="md:hidden"
        aria-label="Abrir menú de navegación"
        onClick={() => setMobileOpen(true)}
      >
        <Menu />
      </Button>

      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="hidden md:inline-flex"
              aria-label={collapsed ? "Expandir navegación" : "Contraer navegación"}
              aria-pressed={collapsed}
              onClick={toggleCollapsed}
            >
              <CollapseIcon />
            </Button>
          }
        />
        <TooltipContent side="bottom">{collapsed ? "Expandir navegación" : "Contraer navegación"}</TooltipContent>
      </Tooltip>

      <span className="font-heading text-sm font-semibold tracking-tight md:hidden">Arefil</span>

      {context && (
        <p className="hidden min-w-0 items-baseline gap-1.5 text-sm md:flex">
          {context.section && (
            <>
              <span className="text-muted-foreground">{context.section}</span>
              <span aria-hidden className="text-muted-foreground/50">
                /
              </span>
            </>
          )}
          <span className="truncate font-medium">{context.page}</span>
        </p>
      )}
    </header>
  );
}

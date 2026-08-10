"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_SECTIONS } from "./nav-items";

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  return (
    <>
      <div className="flex h-14 items-center justify-between border-b border-sidebar-border bg-sidebar px-4 text-sidebar-foreground md:hidden">
        <span className="text-lg font-semibold tracking-tight">Arefil</span>
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          aria-label="Abrir menú de navegación"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-sidebar-accent"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>

      {isOpen && (
        <button
          type="button"
          aria-label="Cerrar menú de navegación"
          onClick={() => setIsOpen(false)}
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex h-screen w-64 shrink-0 -translate-x-full flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-transform duration-200 md:static md:translate-x-0",
          isOpen && "translate-x-0",
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-6">
          <span className="text-lg font-semibold tracking-tight">Arefil</span>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            aria-label="Cerrar menú de navegación"
            className="rounded-md p-1 hover:bg-sidebar-accent md:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav aria-label="Navegación principal" className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
          {NAV_SECTIONS.map((section) => (
            <div key={section.label ?? "root"}>
              {section.label && (
                <p className="px-3 pb-2 text-xs font-medium tracking-wider text-muted-foreground uppercase">
                  {section.label}
                </p>
              )}
              <ul className="space-y-1">
                {section.links.map((link) => {
                  const active = isActive(pathname, link.href);
                  const Icon = link.icon;
                  return (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        onClick={() => setIsOpen(false)}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                          active
                            ? "bg-sidebar-primary text-sidebar-primary-foreground"
                            : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                        )}
                      >
                        <Icon className="h-4 w-4" />
                        {link.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}

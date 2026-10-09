"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

const STORAGE_KEY = "arefil.sidebar.collapsed";

/**
 * The collapse preference lives in `localStorage`, i.e. outside React, so it is
 * read through `useSyncExternalStore`: the server and the hydration pass see
 * `false`, and React re-renders with the stored value right after. Reading it
 * in an effect would cause a cascading render instead.
 */
let cached: boolean | null = null;
const listeners = new Set<() => void>();

function getSnapshot(): boolean {
  if (cached === null) {
    try {
      cached = window.localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      cached = false;
    }
  }
  return cached;
}

function getServerSnapshot(): boolean {
  return false;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function writeCollapsed(next: boolean): void {
  cached = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
  } catch {
    /* private mode / storage disabled: the preference is simply not persisted */
  }
  for (const listener of listeners) listener();
}

interface SidebarState {
  /** Desktop icon-rail mode. */
  collapsed: boolean;
  toggleCollapsed: () => void;
  /** Mobile navigation Sheet. */
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
}

const SidebarContext = createContext<SidebarState | null>(null);

export function SidebarProvider({ children }: { children: ReactNode }) {
  const collapsed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [mobileOpen, setMobileOpen] = useState(false);

  const toggleCollapsed = useCallback(() => {
    writeCollapsed(!getSnapshot());
  }, []);

  const value = useMemo(
    () => ({ collapsed, toggleCollapsed, mobileOpen, setMobileOpen }),
    [collapsed, toggleCollapsed, mobileOpen],
  );

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}

export function useSidebar(): SidebarState {
  const context = useContext(SidebarContext);
  if (!context) throw new Error("useSidebar must be used inside <SidebarProvider>");
  return context;
}

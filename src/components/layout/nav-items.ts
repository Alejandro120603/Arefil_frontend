import type { LucideIcon } from "lucide-react";
import { Archive, FileChartColumn, LayoutDashboard, ListTree, Package, Upload, XCircle } from "lucide-react";
import { type CurrentUser, type Permission, hasPermission } from "@/lib/auth/session";

export interface NavLink {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Hidden unless the signed-in user has it. The backend still enforces it. */
  permission?: Permission;
}

export interface NavSection {
  label: string | null;
  links: NavLink[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    label: null,
    links: [{ label: "Dashboard", href: "/", icon: LayoutDashboard }],
  },
  {
    label: "Donaldson",
    links: [
      { label: "Importar lista", href: "/donaldson/import", icon: Upload, permission: "catalog:write" },
      { label: "Listas de precios", href: "/donaldson/price-lists", icon: ListTree },
      { label: "Productos", href: "/donaldson/products", icon: Package },
      { label: "Cancelados", href: "/donaldson/cancelados", icon: XCircle },
      { label: "Reportes", href: "/donaldson/reports", icon: FileChartColumn },
    ],
  },
  {
    label: "Administración",
    links: [
      { label: "Respaldos", href: "/administracion/respaldos", icon: Archive, permission: "system:backup" },
      { label: "Reportes", href: "/administracion/reportes", icon: FileChartColumn, permission: "reports:admin" },
    ],
  },
];

/** The navigation this user may follow; sections left without links disappear. */
export function navSectionsFor(user: CurrentUser): NavSection[] {
  return NAV_SECTIONS.map((section) => ({
    ...section,
    links: section.links.filter((link) => link.permission == null || hasPermission(user, link.permission)),
  })).filter((section) => section.links.length > 0);
}

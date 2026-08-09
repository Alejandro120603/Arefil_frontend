import type { LucideIcon } from "lucide-react";
import { Archive, LayoutDashboard, ListTree, Package, Upload, XCircle } from "lucide-react";

export interface NavLink {
  label: string;
  href: string;
  icon: LucideIcon;
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
      { label: "Importar lista", href: "/donaldson/import", icon: Upload },
      { label: "Listas de precios", href: "/donaldson/price-lists", icon: ListTree },
      { label: "Productos", href: "/donaldson/products", icon: Package },
      { label: "Cancelados", href: "/donaldson/cancelados", icon: XCircle },
    ],
  },
  {
    label: "Administración",
    links: [{ label: "Respaldos", href: "/administracion/respaldos", icon: Archive }],
  },
];

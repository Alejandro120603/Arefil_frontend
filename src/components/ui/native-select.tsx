import * as React from "react";
import { ChevronDownIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Styled native `<select>`.
 *
 * Deliberately not the Base UI `Select`: every filter in Arefil is a plain GET
 * `<form>` rendered by a Server Component, and a native control submits its
 * value with zero client JavaScript. This exists so those selects stop
 * repeating the same class string in a dozen pages and match `Input` exactly.
 * Use `Select` when the control is already inside a client component and needs
 * rich items.
 */
function NativeSelect({
  className,
  size = "default",
  children,
  ...props
}: Omit<React.ComponentProps<"select">, "size"> & { size?: "default" | "sm" }) {
  return (
    <div className="relative inline-flex w-full min-w-0 items-center">
      <select
        data-slot="native-select"
        className={cn(
          "w-full min-w-0 appearance-none rounded-lg border border-input bg-transparent py-1 pr-7 pl-2.5 text-sm transition-colors outline-none",
          "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
          "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
          "aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20",
          size === "sm" ? "h-7" : "h-8",
          "dark:bg-input/30",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDownIcon
        aria-hidden
        className="pointer-events-none absolute right-2 size-4 text-muted-foreground"
      />
    </div>
  );
}

export { NativeSelect };

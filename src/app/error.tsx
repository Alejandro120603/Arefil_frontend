"use client";

import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Last-resort boundary for unexpected render exceptions. Expected API errors
 * are already caught inline per-page (see `ErrorAlert` usage) so the rest of
 * the page shell/breadcrumbs stay visible - this only catches genuine bugs.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <TriangleAlert className="h-8 w-8 text-destructive" />
      <div>
        <p className="text-sm font-medium">Ocurrió un error inesperado.</p>
        <p className="text-sm text-muted-foreground">Intenta de nuevo o vuelve al dashboard.</p>
      </div>
      <div className="flex gap-2">
        <Button type="button" onClick={reset}>
          Reintentar
        </Button>
      </div>
    </div>
  );
}

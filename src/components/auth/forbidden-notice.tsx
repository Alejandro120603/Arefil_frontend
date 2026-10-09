import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export const FORBIDDEN_MESSAGE = "No tienes permisos para realizar esta acción.";

export function ForbiddenNotice() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <ShieldAlert className="h-8 w-8 text-muted-foreground" aria-hidden />
      <div>
        <h1 className="text-lg font-semibold">Acceso restringido</h1>
        <p className="text-sm text-muted-foreground">{FORBIDDEN_MESSAGE}</p>
      </div>
      <Button nativeButton={false} variant="outline" render={<Link href="/donaldson/reports" />}>
        Ir a reportes
      </Button>
    </div>
  );
}

"use client";

import { useRef, useState } from "react";
import { Loader2, Power, PowerOff } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { getUserErrorMessage } from "@/lib/api/errors";
import { updateLetterhead } from "@/lib/api/letterhead-admin";
import { freshnessClock } from "@/lib/letterheads/freshness";
import type { LetterheadAdmin } from "@/types/letterhead-admin";

/**
 * Deactivate (after a confirmation that explains its effects) or reactivate a
 * letterhead. Deactivating is reversible and is never a deletion: versions,
 * assignments and the executions that pinned a version stay as they are.
 */
export function LetterheadStatusControl({
  letterhead,
  onChanged,
  disabled = false,
}: {
  letterhead: LetterheadAdmin;
  /** `confirmedAt`: when the PATCH's success arrived (see `freshnessClock`). */
  onChanged: (updated: LetterheadAdmin, message: string, confirmedAt: number) => void;
  disabled?: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const savingRef = useRef(false);

  async function change(active: boolean) {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const updated = await updateLetterhead(letterhead.id, { is_active: active });
      // Stamped at confirmation: reads issued while it was pending are older.
      const confirmedAt = freshnessClock();
      setConfirming(false);
      onChanged(
        updated,
        active
          ? `«${updated.display_name}» está activo de nuevo y puede ofrecerse en los reportes donde esté disponible.`
          : `«${updated.display_name}» fue desactivado. Las ejecuciones ya generadas conservan su versión.`,
        confirmedAt,
      );
    } catch (changeError) {
      setError(getUserErrorMessage(changeError, "No se pudo cambiar el estado del membrete."));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      {letterhead.is_active ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-label={`Desactivar ${letterhead.display_name}`}
          disabled={disabled || saving}
          onClick={() => setConfirming(true)}
        >
          <PowerOff /> Desactivar
        </Button>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-label={`Reactivar ${letterhead.display_name}`}
          disabled={disabled || saving}
          onClick={() => void change(true)}
        >
          {saving ? <Loader2 className="animate-spin" /> : <Power />} Reactivar
        </Button>
      )}
      {error && !confirming && <p className="text-sm text-destructive">{error}</p>}
      <AlertDialog
        open={confirming}
        onOpenChange={(open) => {
          if (!savingRef.current) {
            setConfirming(open);
            if (!open) setError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desactivar «{letterhead.display_name}»</AlertDialogTitle>
            <AlertDialogDescription render={<div />}>
              <ul className="flex list-disc flex-col gap-1 pl-4 text-left">
                <li>Dejará de estar disponible para nuevas selecciones en Cotización y Descuento.</li>
                <li>Si es el membrete predeterminado de algún reporte, dejará de serlo y la opción inicial volverá a ser «Sin membrete».</li>
                <li>Las ejecuciones ya generadas conservan la versión que fijaron.</li>
                <li>No se elimina nada: podrás reactivarlo después.</li>
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={saving} onClick={() => void change(false)}>
              {saving ? <Loader2 className="animate-spin" /> : <PowerOff />}
              {saving ? "Desactivando..." : "Desactivar membrete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

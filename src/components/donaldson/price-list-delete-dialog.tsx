"use client";

import { useRef, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
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
import { getUserErrorMessage } from "@/lib/api/errors";
import { deletePriceList } from "@/lib/api/price-list-actions";
import type { PriceList } from "@/types/api";

interface PriceListDeleteDialogProps {
  priceList: PriceList;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}

export function PriceListDeleteDialog({
  priceList,
  open,
  onOpenChange,
  onDeleted,
}: PriceListDeleteDialogProps) {
  const deletingRef = useRef(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (deletingRef.current) return;
    deletingRef.current = true;
    setDeleting(true);
    try {
      await deletePriceList(priceList.id);
      onOpenChange(false);
      toast.success("Lista de precios eliminada correctamente");
      onDeleted();
    } catch (error) {
      toast.error(
        getUserErrorMessage(
          error,
          "No se pudo eliminar la lista de precios. La lista permanece disponible.",
        ),
      );
    } finally {
      deletingRef.current = false;
      setDeleting(false);
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!deletingRef.current) onOpenChange(nextOpen);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Eliminar lista de precios</AlertDialogTitle>
          <AlertDialogDescription>
            ¿Deseas eliminar la lista &quot;{priceList.source_filename}&quot;?
            <span className="mt-2 block">Los productos del catálogo NO serán eliminados.</span>
            <span className="mt-2 block">Esta acción no se puede deshacer.</span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={deleting}
            onClick={() => void handleDelete()}
          >
            {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
            {deleting ? "Eliminando..." : "Eliminar lista"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

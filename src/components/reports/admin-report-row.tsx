"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, Loader2, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { EnabledBadge } from "@/components/shared/status-badge";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TableCell, TableRow } from "@/components/ui/table";
import { getUserErrorMessage } from "@/lib/api/errors";
import { deleteReport } from "@/lib/api/reports";
import type { ReportDefinition } from "@/types/api";

const BASE_PATH = "/administracion/reportes";

export function AdminReportRow({ report }: { report: ReportDefinition }) {
  const router = useRouter();
  const deletingRef = useRef(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const configureHref = `${BASE_PATH}/${encodeURIComponent(report.code)}`;
  const runHref = `/donaldson/reports/${encodeURIComponent(report.code)}`;

  async function handleDelete() {
    if (deletingRef.current) return;
    deletingRef.current = true;
    setDeleting(true);
    try {
      await deleteReport(report.code);
      setConfirming(false);
      setDeleted(true);
      toast.success("Reporte eliminado correctamente");
      router.refresh();
    } catch (error) {
      toast.error(
        getUserErrorMessage(
          error,
          "No se pudo eliminar el reporte. La definición permanece disponible.",
        ),
      );
    } finally {
      deletingRef.current = false;
      setDeleting(false);
    }
  }

  if (deleted) return null;

  return (
    <>
      <TableRow>
        <TableCell className="min-w-64 max-w-[40rem] whitespace-normal align-top">
          <div className="flex flex-col gap-0.5 py-0.5">
            <Link
              href={configureHref}
              className="font-medium underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              {report.name}
            </Link>
            <span className="line-clamp-2 text-xs text-muted-foreground">
              {report.description ?? "Sin descripción"}
            </span>
          </div>
        </TableCell>
        <TableCell className="align-top font-mono text-xs text-muted-foreground">
          {report.code}
        </TableCell>
        <TableCell className="align-top text-muted-foreground">
          {report.data_source?.name ?? "—"}
        </TableCell>
        <TableCell className="align-top">
          {report.category ? (
            <Badge variant="outline">{report.category}</Badge>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </TableCell>
        <TableCell className="align-top">
          <EnabledBadge enabled={report.enabled} />
        </TableCell>
        <TableCell className="align-top text-right">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="icon-sm" aria-label={`Acciones de ${report.name}`}>
                  <MoreHorizontal />
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuItem render={<Link href={configureHref} />}>
                <Pencil /> Editar
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!report.enabled}
                render={report.enabled ? <Link href={runHref} /> : undefined}
              >
                <FileText /> Generar
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={() => setConfirming(true)}>
                <Trash2 /> Eliminar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </TableCell>
      </TableRow>

      <AlertDialog
        open={confirming}
        onOpenChange={(open) => {
          if (!deletingRef.current) setConfirming(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar reporte</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Deseas eliminar el reporte &quot;{report.name}&quot;?
              <span className="mt-2 block">
                Esta acción eliminará su configuración y no se puede deshacer.
              </span>
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
              {deleting ? "Eliminando..." : "Eliminar reporte"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

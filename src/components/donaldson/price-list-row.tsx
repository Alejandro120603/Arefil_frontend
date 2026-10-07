"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, MoreHorizontal, Trash2, XCircle } from "lucide-react";
import { PriceListDeleteDialog } from "@/components/donaldson/price-list-delete-dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TableCell, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/format/date";
import type { PriceList } from "@/types/api";

const BASE_PATH = "/donaldson/price-lists";

export function PriceListRow({ priceList, canDelete }: { priceList: PriceList; canDelete: boolean }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const href = `${BASE_PATH}/${priceList.id}`;

  if (deleted) return null;

  return (
    <>
      <TableRow>
        <TableCell>
          <Link
            href={href}
            className="num font-medium underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            {formatDate(priceList.effective_date)}
          </Link>
        </TableCell>
        <TableCell className="text-muted-foreground">{priceList.supplier}</TableCell>
        <TableCell className="text-muted-foreground">{priceList.currency}</TableCell>
        <TableCell
          className="max-w-[32rem] truncate font-mono text-xs text-muted-foreground"
          title={priceList.source_filename}
        >
          {priceList.source_filename}
        </TableCell>
        <TableCell>
          <StatusBadge status={priceList.status} />
        </TableCell>
        <TableCell className="num text-muted-foreground">{formatDate(priceList.created_at)}</TableCell>
        <TableCell className="text-right">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Acciones de la lista #${priceList.id}`}
                >
                  <MoreHorizontal />
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuItem render={<Link href={href} />}>
                <Eye /> Ver detalle
              </DropdownMenuItem>
              <DropdownMenuItem
                render={<Link href={`/donaldson/cancelados?price_list_id=${priceList.id}`} />}
              >
                <XCircle /> Ver cancelados
              </DropdownMenuItem>
              {canDelete && (
                <DropdownMenuItem variant="destructive" onClick={() => setConfirming(true)}>
                  <Trash2 /> Eliminar
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </TableCell>
      </TableRow>

      {canDelete && (
        <PriceListDeleteDialog
          priceList={priceList}
          open={confirming}
          onOpenChange={setConfirming}
          onDeleted={() => {
            setDeleted(true);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

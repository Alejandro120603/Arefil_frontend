"use client";

import Link from "next/link";
import { History } from "lucide-react";
import { LetterheadThumbnail } from "@/components/letterheads/letterhead-thumbnail";
import { LetterheadStatusControl } from "@/components/letterheads/admin/letterhead-status-control";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { letterheadVersionThumbnailPath } from "@/lib/api/letterhead-admin";
import { letterheadReportLabel } from "@/lib/letterheads/letterhead-admin";
import type { LetterheadAdmin } from "@/types/letterhead-admin";

export function letterheadThumbnailAsset(letterhead: LetterheadAdmin) {
  return letterhead.current_version?.assets.find((asset) => asset.role === "thumbnail") ?? null;
}

/** One identity of the catalog: what it looks like, its state and where it is offered. */
export function LetterheadCatalogCard({
  letterhead,
  onChanged,
}: {
  letterhead: LetterheadAdmin;
  onChanged: (updated: LetterheadAdmin, message: string) => void;
}) {
  const current = letterhead.current_version;
  const thumbnail = letterheadThumbnailAsset(letterhead);
  const offeredIn = letterhead.assignments.filter((assignment) => assignment.is_active);
  const detailHref = `/administracion/membretes/${letterhead.id}`;

  return (
    <Card className="h-full" aria-labelledby={`membrete-${letterhead.id}`}>
      <CardContent className="flex h-full flex-col gap-3">
        <LetterheadThumbnail
          path={current != null ? letterheadVersionThumbnailPath(letterhead.id, current.version) : null}
          alt={`Miniatura del membrete ${letterhead.display_name}`}
          width={thumbnail?.width}
          height={thumbnail?.height}
          className="mx-auto max-w-44"
        />
        <div className="flex min-w-0 flex-col gap-1">
          <h3 id={`membrete-${letterhead.id}`} className="truncate font-medium" title={letterhead.display_name}>
            {letterhead.display_name}
          </h3>
          <p className="truncate font-mono text-xs text-muted-foreground" title={letterhead.slug}>{letterhead.slug}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge variant={letterhead.is_active ? "success" : "outline"}>{letterhead.is_active ? "Activo" : "Inactivo"}</Badge>
          <Badge variant="secondary">{current != null ? `Versión ${current.version}` : "Sin versiones"}</Badge>
          <Badge variant="outline">
            {letterhead.version_count === 1 ? "1 versión" : `${letterhead.version_count} versiones`}
          </Badge>
        </div>
        <div className="text-sm">
          <p className="text-muted-foreground">Disponible en:</p>
          {offeredIn.length === 0 ? (
            <p>Ningún reporte</p>
          ) : (
            <ul className="flex flex-col">
              {offeredIn.map((assignment) => (
                <li key={assignment.report_code}>
                  {letterheadReportLabel(assignment.report_code)}
                  {assignment.is_default ? " · predeterminado" : ""}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="mt-auto flex flex-wrap items-start gap-2">
          <Link
            href={detailHref}
            aria-label={`Versiones y detalle de ${letterhead.display_name}`}
            className={buttonVariants({ size: "sm", variant: "outline" })}
          >
            <History /> Versiones y detalle
          </Link>
          <LetterheadStatusControl letterhead={letterhead} onChanged={onChanged} />
        </div>
      </CardContent>
    </Card>
  );
}

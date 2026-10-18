"use client";

import { useEffect, useState } from "react";
import { ImageOff } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchProtectedImage } from "@/lib/api/protected-image";
import { cn } from "@/lib/utils";

type ThumbnailState =
  | { path: string; status: "ready"; url: string }
  | { path: string; status: "failed" };

/**
 * A letterhead thumbnail: a reference of the design, not a paginated preview
 * of any document.
 *
 * Each instance fetches its own image through the authenticated client, so a
 * failing thumbnail only replaces itself with a fallback and never breaks the
 * list around it. The request is cancelled and the object URL revoked when
 * the path changes or the component unmounts.
 */
export function LetterheadThumbnail({
  path,
  alt,
  width,
  height,
  className,
}: {
  /** Path for the browser API client; `null` shows the fallback without a request. */
  path: string | null;
  alt: string;
  width?: number | null;
  height?: number | null;
  className?: string;
}) {
  const [state, setState] = useState<ThumbnailState | null>(null);

  useEffect(() => {
    if (path == null) return;
    const controller = new AbortController();
    let objectUrl: string | null = null;
    fetchProtectedImage(path, { signal: controller.signal })
      .then((blob) => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setState({ path, status: "ready", url: objectUrl });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ path, status: "failed" });
      });
    return () => {
      controller.abort();
      if (objectUrl == null) return;
      const revoked = objectUrl;
      URL.revokeObjectURL(revoked);
      // Never keep a revoked URL around to be shown again for the same path.
      setState((previous) => (previous?.status === "ready" && previous.url === revoked ? null : previous));
    };
  }, [path]);

  // State left over from a previous path is never shown for the new one.
  const current = path != null && state?.path === path ? state : null;
  const aspectRatio = width != null && height != null && width > 0 && height > 0 ? `${width} / ${height}` : "17 / 22";

  return (
    <div
      className={cn("relative w-full overflow-hidden rounded-md border bg-white", className)}
      style={{ aspectRatio }}
    >
      {path != null && current == null && <Skeleton className="absolute inset-0 rounded-none" aria-label="Cargando miniatura" />}
      {current?.status === "ready" && (
        // A `blob:` URL of an authenticated response: next/image cannot optimize it.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={current.url}
          alt={alt}
          className="absolute inset-0 h-full w-full object-contain"
          onError={() => setState({ path: current.path, status: "failed" })}
        />
      )}
      {(path == null || current?.status === "failed") && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-muted/40 p-2 text-center text-xs text-muted-foreground">
          <ImageOff aria-hidden className="size-5" />
          <span>Miniatura no disponible</span>
        </div>
      )}
    </div>
  );
}

"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { Loader2, Upload, X } from "lucide-react";
import { ErrorAlert } from "@/components/donaldson/error-alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createLetterhead } from "@/lib/api/letterhead-admin";
import {
  LETTERHEAD_NAME_MAX_LENGTH,
  LETTERHEAD_SLUG_MAX_LENGTH,
  LETTERHEAD_SOURCE_MAX_BYTES,
  LETTERHEAD_XLSX_ACCEPT,
  letterheadUploadErrors,
  suggestLetterheadSlug,
  validateLetterheadCreateForm,
  type LetterheadFormErrors,
} from "@/lib/letterheads/letterhead-admin";
import { formatFileSize } from "@/lib/reports/report-excel-template";
import type { LetterheadAdmin } from "@/types/letterhead-admin";

/**
 * New identity with its version 1. The slug is suggested from the name until
 * the admin edits it; it cannot change afterwards. The chosen file stays in
 * memory only (never in client storage) and is kept after a failed upload so
 * a retry does not need the file picker again.
 */
export function LetterheadCreateForm({
  onCreated,
  onCancel,
}: {
  onCreated: (created: LetterheadAdmin) => void;
  onCancel: () => void;
}) {
  const ids = useId();
  const [displayName, setDisplayName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<LetterheadFormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submittingRef.current) return;
    const validation = validateLetterheadCreateForm({ displayName, slug, file });
    setErrors(validation);
    if (Object.keys(validation).length > 0 || file == null) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const created = await createLetterhead({ slug: slug.trim(), display_name: displayName.trim(), file });
      onCreated(created);
    } catch (error) {
      setErrors(letterheadUploadErrors(error, "No se pudo crear el membrete."));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  const field = (name: string) => `${ids}-${name}`;

  return (
    <Card>
      <CardHeader>
        <CardTitle role="heading" aria-level={2}>Nuevo membrete</CardTitle>
        <CardDescription>
          Sube el XLSX original del membrete. Arefil lo valida y guarda su versión 1; el archivo nunca se modifica.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-4" noValidate onSubmit={(event) => void submit(event)}>
          {errors.form && <ErrorAlert title="No se pudo crear el membrete" message={errors.form} />}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={field("name")}>Nombre visible *</Label>
              <Input
                id={field("name")}
                value={displayName}
                maxLength={LETTERHEAD_NAME_MAX_LENGTH}
                disabled={submitting}
                aria-invalid={errors.display_name != null}
                aria-describedby={errors.display_name ? field("name-error") : undefined}
                onChange={(event) => {
                  const value = event.target.value;
                  setDisplayName(value);
                  if (!slugEdited) setSlug(suggestLetterheadSlug(value));
                }}
              />
              {errors.display_name && <p id={field("name-error")} className="text-sm text-destructive">{errors.display_name}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={field("slug")}>Identificador *</Label>
              <Input
                id={field("slug")}
                value={slug}
                maxLength={LETTERHEAD_SLUG_MAX_LENGTH}
                disabled={submitting}
                autoCapitalize="none"
                spellCheck={false}
                className="font-mono"
                aria-invalid={errors.slug != null}
                aria-describedby={`${field("slug-help")}${errors.slug ? ` ${field("slug-error")}` : ""}`}
                onChange={(event) => {
                  setSlug(event.target.value);
                  setSlugEdited(true);
                }}
              />
              <p id={field("slug-help")} className="text-xs text-muted-foreground">
                Minúsculas, dígitos y guiones. No se puede cambiar después.
              </p>
              {errors.slug && <p id={field("slug-error")} className="text-sm text-destructive">{errors.slug}</p>}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={field("file")}>Archivo XLSX *</Label>
            <Input
              id={field("file")}
              type="file"
              accept={LETTERHEAD_XLSX_ACCEPT}
              disabled={submitting}
              aria-invalid={errors.file != null}
              aria-describedby={`${field("file-help")}${errors.file ? ` ${field("file-error")}` : ""}`}
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setErrors((current) => ({ ...current, file: undefined }));
              }}
            />
            <p id={field("file-help")} className="text-xs text-muted-foreground">
              Solo .xlsx, hasta {formatFileSize(LETTERHEAD_SOURCE_MAX_BYTES)}.
              {file != null ? ` Seleccionado: ${file.name} (${formatFileSize(file.size)}).` : ""}
            </p>
            {errors.file && <p id={field("file-error")} className="text-sm text-destructive">{errors.file}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={submitting}>
              {submitting ? <Loader2 className="animate-spin" /> : <Upload />}
              {submitting ? "Validando y guardando..." : "Crear membrete"}
            </Button>
            <Button type="button" variant="ghost" disabled={submitting} onClick={onCancel}>
              <X /> Cancelar
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

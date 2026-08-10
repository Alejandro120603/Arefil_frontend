"use client";

import { useRef, useState, type DragEvent } from "react";
import { Upload } from "lucide-react";
import { cn } from "@/lib/utils";

const ACCEPTED_EXTENSION = ".xlsx";
const ACCEPTED_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function isXlsxFile(file: File): boolean {
  return file.name.toLowerCase().endsWith(ACCEPTED_EXTENSION);
}

interface ImportDropzoneProps {
  onFileSelected: (file: File) => void;
  disabled?: boolean;
}

export function ImportDropzone({ onFileSelected, disabled }: ImportDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    if (!isXlsxFile(file)) {
      setValidationError("Solo se aceptan archivos .xlsx.");
      return;
    }
    setValidationError(null);
    onFileSelected(file);
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        aria-label="Seleccionar archivo Donaldson (.xlsx)"
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(event) => {
          if (disabled) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setIsDragActive(true);
        }}
        onDragLeave={() => setIsDragActive(false)}
        onDrop={(event: DragEvent<HTMLDivElement>) => {
          event.preventDefault();
          setIsDragActive(false);
          if (disabled) return;
          handleFiles(event.dataTransfer.files);
        }}
        className={cn(
          "flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-16 text-center outline-none transition-colors",
          disabled
            ? "cursor-not-allowed opacity-60"
            : "cursor-pointer hover:border-primary/50 hover:bg-muted/40 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
          isDragActive ? "border-primary bg-muted/60" : "border-border",
        )}
      >
        <Upload className="h-8 w-8 text-muted-foreground" />
        <div className="space-y-1">
          <p className="text-sm font-medium">Arrastra el archivo Donaldson aquí</p>
          <p className="text-sm text-muted-foreground">o haz clic para seleccionar un archivo .xlsx</p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={`${ACCEPTED_EXTENSION},${ACCEPTED_MIME}`}
          className="sr-only"
          disabled={disabled}
          onChange={(event) => {
            handleFiles(event.target.files);
            event.target.value = "";
          }}
        />
      </div>
      {validationError && <p className="text-sm text-destructive">{validationError}</p>}
    </div>
  );
}

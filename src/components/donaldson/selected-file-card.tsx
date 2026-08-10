import { FileSpreadsheet, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

interface SelectedFileCardProps {
  file: File;
  onChangeFile: () => void;
  disabled?: boolean;
}

export function SelectedFileCard({ file, onChangeFile, disabled }: SelectedFileCardProps) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <FileSpreadsheet className="h-8 w-8 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{file.name}</p>
            <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
          </div>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onChangeFile} disabled={disabled}>
          <RefreshCcw className="h-4 w-4" />
          Cambiar archivo
        </Button>
      </CardContent>
    </Card>
  );
}

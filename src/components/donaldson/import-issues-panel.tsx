import { AlertTriangle, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ImportIssuesPanelProps {
  errors: string[];
  warnings: string[];
  totalErrors: number;
  totalWarnings: number;
}

export function ImportIssuesPanel({ errors, warnings, totalErrors, totalWarnings }: ImportIssuesPanelProps) {
  if (errors.length === 0 && warnings.length === 0) {
    return null;
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {errors.length > 0 && (
        <IssueList
          title="Errores"
          icon={XCircle}
          tone="destructive"
          items={errors}
          total={totalErrors}
        />
      )}
      {warnings.length > 0 && (
        <IssueList
          title="Advertencias"
          icon={AlertTriangle}
          tone="warning"
          items={warnings}
          total={totalWarnings}
        />
      )}
    </div>
  );
}

interface IssueListProps {
  title: string;
  icon: typeof XCircle;
  tone: "destructive" | "warning";
  items: string[];
  total: number;
}

function IssueList({ title, icon: Icon, tone, items, total }: IssueListProps) {
  const truncated = total > items.length;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle
          className={tone === "destructive" ? "flex items-center gap-2 text-sm font-medium text-destructive" : "flex items-center gap-2 text-sm font-medium text-amber-600"}
        >
          <Icon className="h-4 w-4" />
          {title} ({total.toLocaleString("es-MX")})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="max-h-64 space-y-2 overflow-y-auto text-sm">
          {items.map((item, index) => (
            <li key={index} className="border-b border-border/60 pb-2 last:border-0 last:pb-0">
              {item}
            </li>
          ))}
        </ul>
        {truncated && (
          <p className="mt-2 text-xs text-muted-foreground">
            Mostrando {items.length} de {total.toLocaleString("es-MX")}. El backend trunca la lista devuelta.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

import { CircleCheck, Info } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

/** Outcome of a successful operation, announced politely (a failure uses `ErrorAlert`). */
export function LetterheadNotice({ message, tone = "success" }: { message: string; tone?: "success" | "info" }) {
  const Icon = tone === "success" ? CircleCheck : Info;
  return (
    <Alert role="status" aria-live="polite" className={tone === "success" ? "text-emerald-700 dark:text-emerald-400" : undefined}>
      <Icon aria-hidden />
      <AlertDescription className="text-current">{message}</AlertDescription>
    </Alert>
  );
}

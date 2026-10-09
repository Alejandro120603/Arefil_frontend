import { permanentRedirect } from "next/navigation";

interface LegacyReportPageProps { params: Promise<{ code: string }> }

/**
 * The old all-in-one configuration page (Frontend #41A). The guided wizard is
 * the only configuration surface now; old links and bookmarks keep working and
 * simply land on it.
 */
export default async function LegacyReportPage({ params }: LegacyReportPageProps) {
  const { code } = await params;
  permanentRedirect(`/administracion/reportes/${encodeURIComponent(code)}/configurar`);
}

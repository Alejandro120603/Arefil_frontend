import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/server-session";
import { homePathFor, safeNextPath } from "@/lib/auth/session";

export const metadata = {
  title: "Iniciar sesión | Arefil",
};

interface LoginPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const next = safeNextPath((await searchParams).next);
  // A stale or missing cookie shows the form; a live session goes straight in.
  const user = await getCurrentUser().catch(() => null);
  if (user != null) redirect(next ?? homePathFor(user));

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Arefil</CardTitle>
          <CardDescription>Inicia sesión para continuar.</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm next={next} />
        </CardContent>
      </Card>
    </main>
  );
}

"use client";

import { useState, type FormEvent } from "react";
import { ErrorAlert } from "@/components/donaldson/error-alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login, type LoginResult } from "@/lib/auth/browser-session";
import { homePathFor } from "@/lib/auth/session";

const ERROR_MESSAGES: Record<Extract<LoginResult, { ok: false }>["reason"], string> = {
  invalid: "Usuario o contraseña incorrectos.",
  throttled: "Demasiados intentos fallidos. Espera unos minutos e inténtalo de nuevo.",
  unavailable: "No se pudo iniciar sesión por un problema temporal. Inténtalo de nuevo.",
};

export function LoginForm({
  next,
  navigate = (path: string) => window.location.assign(path),
}: {
  /** Already validated with `safeNextPath`. */
  next: string | null;
  navigate?: (path: string) => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const result = await login(username, password);
    if (result.ok) {
      // A full navigation so every server component renders with the new cookie.
      navigate(next ?? homePathFor(result.user));
      return;
    }
    setPassword("");
    setError(ERROR_MESSAGES[result.reason]);
    setPending(false);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      {error && <ErrorAlert title="No se pudo iniciar sesión" message={error} />}
      <div className="flex flex-col gap-2">
        <Label htmlFor="login-username">Usuario</Label>
        <Input
          id="login-username"
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          value={username}
          onChange={(event) => setUsername(event.target.value)}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="login-password">Contraseña</Label>
        <Input
          id="login-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>
      <Button type="submit" disabled={pending || username.trim() === "" || password === ""}>
        {pending ? "Iniciando sesión…" : "Iniciar sesión"}
      </Button>
    </form>
  );
}

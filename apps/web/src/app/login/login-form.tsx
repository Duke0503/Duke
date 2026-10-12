"use client";

/**
 * The only form in Duke.
 *
 * It posts to `/api/auth/login` on this same origin — the route handler next door — which is
 * where the cookie is set. Nothing here ever sees a token: the answer is `{ ok: true }`.
 *
 * A failure is shown as the API's own sentence. "That username or password is not right." is
 * more use than "401", and it is the same sentence the API writes in its log, so a screenshot of
 * the screen and the log file agree about what happened.
 */

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ErrorNote } from "@/components/duke/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface FailureBody {
  readonly message?: string;
  readonly problems?: readonly { readonly problem?: string }[];
}

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (busy) return;

    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (response.ok) {
        // `replace`, not `push`: after signing in, the login screen should not be one Back
        // press away. `refresh` throws away the router's cached copy of the page that was
        // rendered without a session.
        router.replace(next);
        router.refresh();
        return;
      }

      const body = (await response.json().catch(() => null)) as FailureBody | null;
      setError(body?.problems?.[0]?.problem ?? body?.message ?? "Could not sign in.");
      setBusy(false);
    } catch {
      setError("Could not reach Duke. Is the server running?");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="username">Username</Label>
        <Input
          id="username"
          name="username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          autoFocus
          className="h-11"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          className="h-11"
        />
      </div>

      {error === null ? null : <ErrorNote>{error}</ErrorNote>}

      <Button type="submit" className="h-11 w-full" disabled={busy}>
        {busy ? "Checking…" : "Come in"}
      </Button>

      <p className="text-muted-foreground text-center text-[11px] leading-relaxed">
        This door is the only thing standing between your free minutes and everyone else&apos;s.
      </p>
    </form>
  );
}

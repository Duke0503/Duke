/**
 * The door.
 *
 * One screen, reached either by typing the address or by being sent here — the proxy adds
 * `?next=` so whoever arrives lands back where they were trying to go.
 *
 * It looks like the rest of Duke on purpose. A plain browser dialog or a bare white form would
 * say "somebody else's software" at the exact moment the app is asking to be trusted.
 */

import type { Metadata } from "next";
import { Headline, MicroLabel, VoiceLine } from "@/components/duke/bits";
import { safeNext } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign in · Duke",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const requested = params["next"];
  const next = safeNext(Array.isArray(requested) ? requested[0] : requested);

  return (
    <main className="flex min-h-dvh flex-col justify-center px-5 py-10">
      <div className="mx-auto flex w-full max-w-sm flex-col gap-7">
        <div className="flex flex-col gap-3">
          <MicroLabel>Duke</MicroLabel>
          <Headline>This one is yours.</Headline>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Duke answers on a free tier, so the door is locked. Your friends, your calls and your
            minutes are behind it.
          </p>
          <VoiceLine live className="mt-1" />
        </div>

        <LoginForm next={next} />
      </div>
    </main>
  );
}

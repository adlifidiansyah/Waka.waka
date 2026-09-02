"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { Card, CardBody } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { GithubMark, GoogleMark } from "@/components/auth/provider-icons";

type Mode = "signin" | "signup";

export function LoginForm({
  nextPath,
  initialError,
}: {
  nextPath: string;
  initialError?: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setNotice(null);

    try {
      const supabase = createClient();
      if (mode === "signup") {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${nextPath}` },
        });
        if (signUpError) throw signUpError;
        setNotice("Check your inbox to confirm your address, then sign in.");
        setMode("signin");
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
        router.push(nextPath);
        router.refresh();
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong. Try again.");
    } finally {
      setPending(false);
    }
  }

  async function handleOAuth(provider: "github" | "google") {
    setPending(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: `${window.location.origin}/auth/callback?next=${nextPath}` },
      });
      if (oauthError) throw oauthError;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not start sign-in.");
      setPending(false);
    }
  }

  return (
    <Card>
      <CardBody className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={() => handleOAuth("github")} disabled={pending}>
            <GithubMark />
            GitHub
          </Button>
          <Button variant="secondary" onClick={() => handleOAuth("google")} disabled={pending}>
            <GoogleMark />
            Google
          </Button>
        </div>

        <div className="flex items-center gap-3">
          <span className="h-px flex-1 bg-ink-200" />
          <span className="text-xs uppercase tracking-wide text-ink-400">or</span>
          <span className="h-px flex-1 bg-ink-200" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              className="input mt-1"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              className="input mt-1"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              minLength={8}
              required
            />
          </div>

          <FormMessage error={error} success={notice} />

          <Button type="submit" className="w-full" disabled={pending}>
            {mode === "signin" ? "Sign in" : "Create account"}
          </Button>
        </form>

        <p className="text-center text-sm text-ink-500">
          {mode === "signin" ? "New to ClientDeck?" : "Already have an account?"}{" "}
          <button
            type="button"
            className="font-medium text-brand-600 hover:underline"
            onClick={() => {
              setMode(mode === "signin" ? "signup" : "signin");
              setError(null);
              setNotice(null);
            }}
          >
            {mode === "signin" ? "Create an account" : "Sign in"}
          </button>
        </p>
      </CardBody>
    </Card>
  );
}

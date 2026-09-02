import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { LoginForm } from "@/components/auth/login-form";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";

export const metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;

  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) redirect(next ?? "/dashboard");
  }

  return (
    <main className="flex min-h-dvh flex-col bg-ink-50">
      <div className="mx-auto w-full max-w-6xl px-6 py-6">
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-900">
          <ArrowLeft className="size-4" aria-hidden />
          Back
        </Link>
      </div>

      <div className="flex flex-1 items-start justify-center px-6 pb-16">
        <div className="w-full max-w-sm">
          <div className="mb-6 text-center">
            <span className="mx-auto grid size-9 place-items-center rounded-lg bg-ink-900 text-sm font-semibold text-white">
              C
            </span>
            <h1 className="mt-4 text-xl font-semibold tracking-tight text-ink-900">
              Sign in to ClientDeck
            </h1>
            <p className="mt-1 text-sm text-ink-500">
              For freelancers and agency owners. Clients don&apos;t sign in — they use their portal
              link.
            </p>
          </div>
          <LoginForm nextPath={next ?? "/dashboard"} initialError={error} />
        </div>
      </div>
    </main>
  );
}

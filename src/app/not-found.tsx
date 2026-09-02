import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-sm font-semibold text-brand-600">404</p>
      <h1 className="text-2xl font-semibold text-ink-900">We couldn&apos;t find that page</h1>
      <p className="max-w-sm text-sm text-ink-500">
        The link may have been changed or removed. If a client sent you here, ask them for a fresh
        portal link.
      </p>
      <Link href="/">
        <Button variant="secondary">Back to home</Button>
      </Link>
    </main>
  );
}

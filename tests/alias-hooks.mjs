import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Resolves the project's `@/*` path alias for the test runner.
 *
 * Next and tsc understand `tsconfig.json`'s `paths`; plain node does not.
 * Without this, only modules that happen to import nothing are testable, which
 * is the wrong reason to shape a module.
 */
const SRC = new URL("../src/", import.meta.url);
const CANDIDATES = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];

export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    const base = specifier.slice(2);
    for (const suffix of CANDIDATES) {
      const candidate = new URL(`${base}${suffix}`, SRC);
      if (existsSync(fileURLToPath(candidate))) {
        return next(candidate.href, context);
      }
    }
  }
  return next(specifier, context);
}

/** Shape every Server Action returns so forms can render errors uniformly. */
export interface ActionState {
  error?: string;
  success?: string;
  /** Set once, when a client link is minted — the raw token is never re-readable. */
  createdLink?: string;
}

export const ok = (success: string, extra?: Partial<ActionState>): ActionState => ({
  success,
  ...extra,
});

export const fail = (error: string): ActionState => ({ error });

export function messageFrom(caught: unknown, fallback: string) {
  if (caught instanceof Error && caught.message) return caught.message;
  return fallback;
}

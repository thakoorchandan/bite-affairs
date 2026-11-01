/** Errors whose message is safe to show to end users. */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string = "BAD_REQUEST",
    public readonly status: number = 400,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const notFound = (what = "Resource") => new AppError(`${what} not found`, "NOT_FOUND", 404);
export const forbidden = (message = "You are not allowed to do that") => new AppError(message, "FORBIDDEN", 403);
export const unauthorized = (message = "Please sign in to continue") => new AppError(message, "UNAUTHORIZED", 401);

export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? { data?: undefined } : { data: T }))
  | { ok: false; error: string; code?: string; fieldErrors?: Record<string, string[] | undefined> };

export function toActionError(error: unknown): { ok: false; error: string; code?: string; fieldErrors?: Record<string, string[] | undefined> } {
  if (error instanceof AppError) {
    return { ok: false, error: error.message, code: error.code, fieldErrors: error.details as Record<string, string[]> | undefined };
  }
  if (error && typeof error === "object" && "issues" in error && Array.isArray((error as { issues: unknown[] }).issues)) {
    const issues = (error as { issues: { path: PropertyKey[]; message: string }[] }).issues;
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of issues) {
      const key = issue.path.map(String).join(".") || "_";
      (fieldErrors[key] ??= []).push(issue.message);
    }
    return { ok: false, error: issues[0]?.message ?? "Invalid input", code: "VALIDATION", fieldErrors };
  }
  // Next.js control-flow errors (redirect/notFound) must propagate.
  if (error && typeof error === "object" && "digest" in error && typeof (error as { digest: unknown }).digest === "string" && (error as { digest: string }).digest.startsWith("NEXT_")) {
    throw error;
  }
  console.error(error);
  return { ok: false, error: "Something went wrong. Please try again.", code: "INTERNAL" };
}

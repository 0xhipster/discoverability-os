/**
 * Thrown for expected, user-facing failures (bad input, blocked host, page
 * too large, etc). The message on a UserError is safe to return to the
 * client as-is.
 *
 * Anything else (SDK errors, unexpected shape mismatches, uncaught
 * TypeErrors) should NOT be shown to the client verbatim — catch it, log
 * the real error server-side, and surface a generic message instead. See
 * app/api/analyze/route.ts.
 */
export class UserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserError";
  }
}

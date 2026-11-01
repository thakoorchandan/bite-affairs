/**
 * Each app (store / admin) uses its own session cookie names. Cookies are shared across ports on `localhost`
 * (and across sibling subdomains if a cookie domain is ever set), so a shared name would make signing into
 * one app overwrite the other's session. APP_ID is set per app in next.config.ts (`env: { APP_ID }`).
 */
export type AppId = "store" | "admin";

export function currentAppId(): AppId {
  return process.env.APP_ID === "admin" ? "admin" : "store";
}

export function useSecureCookies(): boolean {
  return (process.env.NEXTAUTH_URL ?? process.env.AUTH_URL ?? "").startsWith("https://");
}

export function authCookieNames(appId: AppId = currentAppId(), secure: boolean = useSecureCookies()) {
  return {
    sessionToken: `${secure ? "__Secure-" : ""}bite-${appId}.session-token`,
    callbackUrl: `${secure ? "__Secure-" : ""}bite-${appId}.callback-url`,
    csrfToken: `${secure ? "__Host-" : ""}bite-${appId}.csrf-token`,
  };
}

/** Options for `getToken()` (proxy / middleware) so it reads the same cookie next-auth wrote. */
export function tokenCookieOptions(appId: AppId = currentAppId()) {
  const secure = useSecureCookies();
  return { cookieName: authCookieNames(appId, secure).sessionToken, secureCookie: secure };
}

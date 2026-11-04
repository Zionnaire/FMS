import "server-only";

/** Server-only environment accessors. Importing `server-only` makes it a build error for any
 * Client Component to import this module, so `BACKEND_URL` can never end up in a client
 * bundle — see backend-client.ts's own doc comment for why the backend origin is never
 * exposed to the browser at all. */
function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function backendUrl(): string {
  return required("BACKEND_URL").replace(/\/$/, "");
}

/** Cookies default to `Secure`; only relaxed for a plain-HTTP local dev setup where the browser
 * would otherwise silently refuse to store them. Never relax this in a deployed environment. */
export function cookiesSecure(): boolean {
  return process.env.COOKIES_SECURE !== "false";
}

const PRODUCTION_DOMAIN = "mng.levarlux.com";

export function getBaseDomain(): string {
  if (typeof window === "undefined") return PRODUCTION_DOMAIN;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  if (appUrl.includes("localhost") || appUrl.includes("127.0.0.1"))
    return PRODUCTION_DOMAIN;
  try {
    return new URL(appUrl).hostname;
  } catch {
    return PRODUCTION_DOMAIN;
  }
}

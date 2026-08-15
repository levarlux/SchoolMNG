/**
 * Open a URL in the user's default external browser.
 *
 * In Tauri, `window.location.href` navigates the embedded webview, which
 * causes Paystack (and other payment providers) to hide M-Pesa/Airtel/bank
 * channels because they detect an embedded context. This utility opens the
 * URL in the system's default browser (Chrome, Edge, etc.) instead, where
 * all payment channels are shown.
 */
export async function openInBrowser(url: string): Promise<void> {
  try {
    // Check if we're running inside Tauri
    const { isTauri } = await import("@tauri-apps/api/core");
    if (isTauri()) {
      const { open } = await import("@tauri-apps/plugin-shell");
      await open(url);
      return;
    }
  } catch {
    // Not in Tauri or plugin not available — fall through to web fallback
  }

  // Web fallback: open in a new tab
  window.open(url, "_blank", "noopener,noreferrer");
}

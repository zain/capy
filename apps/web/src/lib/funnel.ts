export function trackFunnel(event: string) {
  try {
    window.posthog?.capture(event);
  } catch {
    /* Analytics must not interrupt onboarding. */
  }
}

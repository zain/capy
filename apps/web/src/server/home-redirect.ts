/** Where "/" sends a visitor on a self-hosted install, which has no landing page; null keeps the landing page. */
export function homeRedirect(selfHosted: boolean, signedIn: boolean) {
  if (!selfHosted) return null;
  return signedIn ? "/dashboard" : "/signup";
}

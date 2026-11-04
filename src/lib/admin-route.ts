export function isInternalAdminPath(pathname: string): boolean {
  return /^\/sprava(?:\/|$)/.test(pathname);
}

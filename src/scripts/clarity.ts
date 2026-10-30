import { isInternalAdminPath } from '../lib/admin-route';

const cookieName = 'bubu_cookie_consent';
let loaded = false;

function hasAnalyticsConsent(): boolean {
  const row = document.cookie.split('; ').find((item) => item.startsWith(`${cookieName}=`));
  if (!row) return false;
  try {
    const consent = JSON.parse(decodeURIComponent(row.slice(cookieName.length + 1)));
    return consent.version === 1 && consent.analytics === true;
  } catch {
    return false;
  }
}

function loadClarity(): void {
  if (loaded || isInternalAdminPath(window.location.pathname) || !hasAnalyticsConsent()) return;
  loaded = true;
  const script = document.createElement('script');
  script.async = true;
  script.src = 'https://www.clarity.ms/tag/z57v04mb3d';
  document.head.append(script);
}

loadClarity();
document.addEventListener('bubu:cookie-consent-updated', () => {
  if (loaded && !hasAnalyticsConsent()) {
    window.location.reload();
    return;
  }
  loadClarity();
});

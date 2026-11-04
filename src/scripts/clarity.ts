import { isInternalAdminPath } from '../lib/admin-route';

const cookieName = 'bubu_cookie_consent';
let loaded = false;

type ClarityCommand = (...args: unknown[]) => void;
type ClarityQueue = ClarityCommand & { q?: unknown[][] };
const clarityWindow = window as Window & { clarity?: ClarityQueue };

function readConsent(): { analytics: boolean; marketing: boolean } | null {
  const row = document.cookie.split('; ').find((item) => item.startsWith(`${cookieName}=`));
  if (!row) return null;
  try {
    const consent = JSON.parse(decodeURIComponent(row.slice(cookieName.length + 1)));
    return consent.version === 1
      ? { analytics: consent.analytics === true, marketing: consent.marketing === true }
      : null;
  } catch {
    return null;
  }
}

function updateClarity(): void {
  if (isInternalAdminPath(window.location.pathname)) return;
  const consent = readConsent();
  if (!consent?.analytics) {
    if (loaded) {
      clarityWindow.clarity?.('consentv2', { ad_Storage: 'denied', analytics_Storage: 'denied' });
      window.location.reload();
    }
    return;
  }

  // The Clarity tag calls window.clarity as soon as it executes. Queue the
  // consent command before inserting the external script, as in its snippet.
  clarityWindow.clarity ??= Object.assign(
    (...args: unknown[]) => {
      (clarityWindow.clarity!.q ??= []).push(args);
    },
    { q: [] as unknown[][] },
  );
  clarityWindow.clarity('consentv2', {
    ad_Storage: consent.marketing ? 'granted' : 'denied',
    analytics_Storage: 'granted',
  });
  if (loaded) return;
  loaded = true;
  const script = document.createElement('script');
  script.async = true;
  script.src = 'https://www.clarity.ms/tag/z57v04mb3d';
  document.head.append(script);
}

updateClarity();
document.addEventListener('bubu:cookie-consent-updated', updateClarity);

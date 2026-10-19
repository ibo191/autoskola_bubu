// First-party attribution is retained only after advertising consent.
const key = 'bubu:ad-attribution-v1';
const consentKey = 'bubu_cookie_consent';
const clickKeys = ['gclid', 'gbraid', 'wbraid'] as const;
const utmKeys = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_id',
  'utm_term',
  'utm_content',
] as const;

function marketingAllowed() {
  try {
    const row = document.cookie.split('; ').find((part) => part.startsWith(`${consentKey}=`));
    const value = row ? JSON.parse(decodeURIComponent(row.slice(consentKey.length + 1))) : null;
    return value?.version === 1 && value.marketing === true;
  } catch {
    return false;
  }
}

export type AdAttribution = {
  gclid?: string;
  gbraid?: string;
  wbraid?: string;
  utm: Record<string, string>;
  landingPage: string;
  firstClickAt: string;
  consentAt: string;
};

function capture() {
  if (!marketingAllowed()) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* Storage may be unavailable. */
    }
    return;
  }
  try {
    if (localStorage.getItem(key)) return;
    const params = new URLSearchParams(location.search);
    const clicks = Object.fromEntries(
      clickKeys.flatMap((name) => {
        const value = params.get(name)?.slice(0, 256);
        return value ? [[name, value]] : [];
      }),
    );
    const utm = Object.fromEntries(
      utmKeys.flatMap((name) => {
        const value = params.get(name)?.slice(0, 256);
        return value ? [[name, value]] : [];
      }),
    );
    if (!Object.keys(clicks).length && !Object.keys(utm).length) return;
    const consent = document.cookie.split('; ').find((part) => part.startsWith(`${consentKey}=`));
    const consentAt = JSON.parse(
      decodeURIComponent(consent!.slice(consentKey.length + 1)),
    ).decidedAt;
    const landing = new URL(location.href);
    landing.search = '';
    landing.hash = '';
    localStorage.setItem(
      key,
      JSON.stringify({
        ...clicks,
        utm,
        landingPage: landing.href,
        firstClickAt: new Date().toISOString(),
        consentAt,
      }),
    );
  } catch {
    /* Tracking must never interrupt a booking. */
  }
}

export function readAdAttribution(): AdAttribution | null {
  if (!marketingAllowed()) return null;
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null') as AdAttribution | null;
  } catch {
    return null;
  }
}

capture();
document.addEventListener('bubu:cookie-consent-updated', capture);

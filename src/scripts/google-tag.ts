export {};

declare global {
  interface Window {
    dataLayer?: IArguments[];
  }
}

const cookieName = 'bubu_cookie_consent';
const googleTagId = document.body.dataset.googleTagId?.trim() ?? '';

// Basic Consent Mode: no Google script, storage or network request exists until
// the visitor expressly grants analytics consent.
if (/^AW-\d+$/i.test(googleTagId)) {
  const disabledKey = `ga-disable-${googleTagId}`;
  const googleWindow = window as unknown as Window & Record<string, boolean | unknown>;
  let initialized = false;

  function readConsent() {
    const row = document.cookie.split('; ').find((item) => item.startsWith(`${cookieName}=`));
    if (!row) return null;
    try {
      return JSON.parse(decodeURIComponent(row.slice(cookieName.length + 1))) as {
        analytics?: boolean;
      };
    } catch {
      return null;
    }
  }

  function gtag(..._args: unknown[]) {
    (window.dataLayer ??= []).push(arguments);
  }

  function updateConsent(granted: boolean) {
    googleWindow[disabledKey] = !granted;
    if (!initialized) return;
    gtag('consent', 'update', {
      analytics_storage: granted ? 'granted' : 'denied',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    });
  }

  function loadGoogleTag() {
    if (initialized) {
      updateConsent(true);
      return;
    }
    initialized = true;
    googleWindow[disabledKey] = false;
    gtag('js', new Date());
    gtag('consent', 'default', {
      analytics_storage: 'granted',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    });
    // AW is the one global Google tag. The linked GA4 destination receives its
    // page view through the Google tag configuration in Google Analytics.
    gtag('config', googleTagId, { send_page_view: true });

    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(googleTagId)}`;
    document.head.append(script);
  }

  function track(name: string, parameters: Record<string, string | number> = {}) {
    if (!initialized || googleWindow[disabledKey]) return;
    gtag('event', name, parameters);
  }

  function updateFromCookie(consent: { analytics?: boolean } | null) {
    if (consent?.analytics) loadGoogleTag();
    else updateConsent(false);
  }

  updateFromCookie(readConsent());
  document.addEventListener('bubu:cookie-consent-updated', (event) => {
    const consent = event instanceof CustomEvent ? event.detail : null;
    updateFromCookie(consent);
  });
  window.addEventListener('bubu:tracking', (event) => {
    const detail = event instanceof CustomEvent ? event.detail : null;
    if (!detail || typeof detail.name !== 'string') return;
    track(detail.name, {
      ...(typeof detail.course === 'string' ? { course: detail.course } : {}),
      ...(typeof detail.branch === 'string' ? { branch: detail.branch } : {}),
      ...(typeof detail.campaign === 'string' ? { campaign: detail.campaign } : {}),
      ...(typeof detail.valueCzk === 'number' ? { value: detail.valueCzk, currency: 'CZK' } : {}),
    });
  });
  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest('a[href]') : null;
    if (!target) return;
    const href = target.getAttribute('href')?.toLowerCase() ?? '';
    if (href.startsWith('tel:')) track('click_phone');
    else if (href.startsWith('mailto:')) track('click_email');
    else if (href.includes('wa.me/') || href.includes('whatsapp.com/')) track('click_whatsapp');
  });
}

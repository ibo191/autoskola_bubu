export {};

declare global {
  interface Window {
    dataLayer?: IArguments[];
  }
}

const cookieName = 'bubu_cookie_consent';
const measurementId = document.body.dataset.gaMeasurementId?.trim() ?? '';

if (/^G-[A-Z0-9]+$/i.test(measurementId)) {
  const disabledKey = `ga-disable-${measurementId}`;
  const gaWindow = window as unknown as Window & Record<string, boolean | unknown>;
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
    gaWindow[disabledKey] = !granted;
    if (!initialized) return;
    gtag('consent', 'update', {
      analytics_storage: granted ? 'granted' : 'denied',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    });
  }

  function loadAnalytics() {
    if (initialized) {
      updateConsent(true);
      return;
    }
    initialized = true;
    gaWindow[disabledKey] = false;
    gtag('js', new Date());
    gtag('consent', 'default', {
      analytics_storage: 'granted',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    });
    gtag('config', measurementId, { send_page_view: true });

    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
    document.head.append(script);
  }

  function track(name: string, parameters: Record<string, string | number> = {}) {
    if (!initialized || gaWindow[disabledKey]) return;
    gtag('event', name, parameters);
  }

  function updateFromCookie(consent: { analytics?: boolean } | null) {
    if (consent?.analytics) loadAnalytics();
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

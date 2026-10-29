export {};
import { isInternalAdminPath } from '../lib/admin-route';

declare global {
  interface Window {
    dataLayer?: Array<IArguments | Record<string, string | number>>;
  }
}

const cookieName = 'bubu_cookie_consent';
const googleTagId = document.body.dataset.googleTagId?.trim() ?? '';
const googleTagManagerId = 'GTM-PGNDXXCL';

// Basic Consent Mode: no Google script or request exists until the visitor
// expressly grants analytics or marketing consent.
if (!isInternalAdminPath(window.location.pathname) && /^AW-\d+$/i.test(googleTagId)) {
  const disabledKey = `ga-disable-${googleTagId}`;
  const googleWindow = window as unknown as Window & Record<string, boolean | unknown>;
  let initialized = false;
  let pageViewSent = false;
  let tagConfigured = false;

  type Consent = { analytics?: boolean; marketing?: boolean };

  function readConsent() {
    const row = document.cookie.split('; ').find((item) => item.startsWith(`${cookieName}=`));
    if (!row) return null;
    try {
      const parsed = JSON.parse(decodeURIComponent(row.slice(cookieName.length + 1))) as Consent & {
        version?: number;
      };
      return parsed.version === 1 ? parsed : null;
    } catch {
      return null;
    }
  }

  function gtag(..._args: unknown[]) {
    (window.dataLayer ??= []).push(arguments);
  }

  function updateConsent(consent: Consent | null) {
    const analytics = Boolean(consent?.analytics);
    const marketing = Boolean(consent?.marketing);
    googleWindow[disabledKey] = !analytics && !marketing;
    if (!initialized) return;
    gtag('consent', 'update', {
      analytics_storage: analytics ? 'granted' : 'denied',
      ad_storage: marketing ? 'granted' : 'denied',
      ad_user_data: marketing ? 'granted' : 'denied',
      ad_personalization: marketing ? 'granted' : 'denied',
    });
    if (analytics && tagConfigured && !pageViewSent) {
      pageViewSent = true;
      gtag('event', 'page_view');
    }
  }

  function loadGoogleTag(consent: Consent) {
    if (initialized) {
      updateConsent(consent);
      return;
    }
    initialized = true;
    googleWindow[disabledKey] = false;
    gtag('js', new Date());
    gtag('consent', 'default', {
      analytics_storage: 'denied',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    });
    updateConsent(consent);
    // AW is the one global Google tag. The linked GA4 destination receives its
    // page view through the Google tag configuration in Google Analytics.
    gtag('config', googleTagId, { send_page_view: false });
    tagConfigured = true;
    if (consent.analytics) {
      pageViewSent = true;
      gtag('event', 'page_view');
    }

    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(googleTagId)}`;
    document.head.append(script);

    // Load the GTM container only after the same consent that permits Google
    // tracking. Its tags must also respect analytics/marketing consent.
    (window.dataLayer ??= []).push({ 'gtm.start': Date.now(), event: 'gtm.js' });
    const managerScript = document.createElement('script');
    managerScript.async = true;
    managerScript.src = `https://www.googletagmanager.com/gtm.js?id=${googleTagManagerId}`;
    document.head.append(managerScript);
  }

  function track(name: string, parameters: Record<string, string | number> = {}) {
    if (!initialized || googleWindow[disabledKey]) return false;
    const configuratorEvents = [
      'course_config_start',
      'course_type_selected',
      'course_location_selected',
      'course_transmission_selected',
      'course_config_completed',
      'course_registration_click',
    ];
    if (configuratorEvents.includes(name) && !readConsent()?.analytics) return false;
    // The object supports a future GTM Custom Event trigger; the gtag command
    // continues to feed the one existing Google tag and its GA4 destination.
    // generate_lead is sent through the Google tag once; mirroring it as a GTM
    // Custom Event could fire a second conversion tag for the same order.
    if (name !== 'generate_lead' && !configuratorEvents.includes(name))
      (window.dataLayer ??= []).push({ event: name, ...parameters });
    gtag('event', name, parameters);
    return true;
  }

  function flushPendingLead() {
    const confirmation = document.querySelector<HTMLElement>(
      '.conversion-summary[data-public-code]',
    );
    if (!confirmation || !initialized || googleWindow[disabledKey]) return;
    try {
      const pending = JSON.parse(sessionStorage.getItem('bubu:pending-lead') ?? 'null') as {
        publicCode?: string;
        applicationId?: string;
        branch?: string;
        course?: string;
        campaign?: string;
      } | null;
      if (
        !pending ||
        pending.publicCode !== confirmation.dataset.publicCode ||
        pending.branch !== confirmation.dataset.branch ||
        pending.course !== confirmation.dataset.course ||
        !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(pending.applicationId ?? '')
      )
        return;
      const sentKey = `bubu:lead-sent:${pending.applicationId}`;
      if (sessionStorage.getItem(sentKey)) {
        sessionStorage.removeItem('bubu:pending-lead');
        return;
      }
      const sent = track('generate_lead', {
        branch: pending.branch!,
        course: pending.course!.toUpperCase(),
        application_id: pending.applicationId!,
        ...(pending.campaign === 'zimni-kampan' ? { campaign: pending.campaign } : {}),
      });
      if (sent) {
        sessionStorage.setItem(sentKey, '1');
        sessionStorage.removeItem('bubu:pending-lead');
      }
    } catch {
      // Storage can be unavailable; tracking must never affect an order.
    }
  }

  function updateFromCookie(consent: Consent | null) {
    if (consent?.analytics || consent?.marketing) loadGoogleTag(consent);
    else updateConsent(null);
    flushPendingLead();
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
      ...(typeof detail.course === 'string' ? { course: detail.course.toUpperCase() } : {}),
      ...(typeof detail.courseType === 'string' ? { course_type: detail.courseType } : {}),
      ...(typeof detail.courseId === 'string' ? { course_id: detail.courseId } : {}),
      ...(typeof detail.location === 'string' ? { location: detail.location } : {}),
      ...(typeof detail.transmission === 'string' ? { transmission: detail.transmission } : {}),
      ...(typeof detail.stepNumber === 'number' ? { step_number: detail.stepNumber } : {}),
      ...(typeof detail.branch === 'string' ? { branch: detail.branch } : {}),
      ...(typeof detail.applicationId === 'string' ? { application_id: detail.applicationId } : {}),
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

export type PublicRecaptchaAction = 'order' | 'reservation' | 'contact' | 'campaign_request';

declare global {
  interface Window {
    grecaptcha?: {
      ready(callback: () => void): void;
      execute(siteKey: string, options: { action: string }): Promise<string>;
    };
  }
}

let scriptPromise: Promise<void> | undefined;

function siteKey() {
  return document.body.dataset.recaptchaSiteKey ?? '';
}

async function loadRecaptcha(key: string) {
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(key)}`;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('RECAPTCHA_LOAD_FAILED'));
      document.head.append(script);
    });
  }
  await scriptPromise;
}

/** Gets a new token only at the moment a protected request is submitted. */
export async function getRecaptchaToken(action: PublicRecaptchaAction): Promise<string> {
  const key = siteKey();
  if (!key) throw new Error('RECAPTCHA_NOT_CONFIGURED');
  await loadRecaptcha(key);
  const captcha = window.grecaptcha;
  if (!captcha) throw new Error('RECAPTCHA_LOAD_FAILED');
  return new Promise((resolve, reject) => {
    captcha.ready(() => captcha.execute(key, { action }).then(resolve, reject));
  });
}

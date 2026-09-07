export const CONSENT_COOKIE_NAME = 'bubu_cookie_consent';
export const CONSENT_VERSION = 1;

export type ConsentCategory = 'necessary' | 'analytics' | 'marketing';

export type ConsentState = {
  version: number;
  necessary: true;
  analytics: boolean;
  marketing: boolean;
  decidedAt: string;
};

export function normalizeConsent(input: Partial<ConsentState>): ConsentState {
  return {
    version: CONSENT_VERSION,
    necessary: true,
    analytics: Boolean(input.analytics),
    marketing: Boolean(input.marketing),
    decidedAt: typeof input.decidedAt === 'string' ? input.decidedAt : new Date().toISOString(),
  };
}

export function parseConsentCookie(value: string | undefined): ConsentState | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(value)) as Partial<ConsentState>;
    if (parsed.version !== CONSENT_VERSION) return null;
    return normalizeConsent(parsed);
  } catch {
    return null;
  }
}

export function hasOptionalConsent(
  state: ConsentState | null,
  category: Exclude<ConsentCategory, 'necessary'>,
) {
  return Boolean(state?.[category]);
}

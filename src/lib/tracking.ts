import type { ConsentCategory } from './consent';

export type TrackingEvent = {
  name: string;
  category: Exclude<ConsentCategory, 'necessary'>;
  valueCzk?: number;
  course?: string;
  branch?: string;
};

function safeEvent(input: TrackingEvent) {
  return {
    name: input.name.replace(/[^a-zA-Z0-9_:-]/g, '').slice(0, 80),
    category: input.category,
    valueCzk:
      typeof input.valueCzk === 'number' ? Math.max(0, Math.round(input.valueCzk)) : undefined,
    course: input.course?.slice(0, 80),
    branch: input.branch?.slice(0, 80),
  };
}

export function trackAnalyticsEvent(input: Omit<TrackingEvent, 'category'>) {
  void safeEvent({ ...input, category: 'analytics' });
}

export function trackMarketingEvent(input: Omit<TrackingEvent, 'category'>) {
  void safeEvent({ ...input, category: 'marketing' });
}

export function trackLead(input: Omit<TrackingEvent, 'name' | 'category'> = {}) {
  trackMarketingEvent({ ...input, name: 'lead' });
}

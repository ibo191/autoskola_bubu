import { test, expect } from '@playwright/test';

test('built CSP permits the Google Ads conversion script without broadening other directives', async ({
  page,
}) => {
  const response = await page.goto('/cenik');
  expect(response?.ok()).toBe(true);
  const policy = await page
    .locator('meta[http-equiv="content-security-policy"]')
    .getAttribute('content');
  expect(policy).toBeTruthy();
  const directives = new Map(
    policy!.split(';').map((part) => {
      const [name, ...sources] = part.trim().split(/\s+/);
      return [name, sources] as const;
    }),
  );
  expect(directives.get('script-src-elem')).toContain('https://googleads.g.doubleclick.net');
  expect(directives.get('script-src')).toContain('https://googleads.g.doubleclick.net');
  expect(directives.get('script-src-elem')).not.toContain("'unsafe-eval'");
  expect(directives.get('script-src-elem')).not.toContain('*');
  expect(directives.get('object-src')).toEqual(["'none'"]);
  // Astro emits the policy as a meta directive on prerendered pages.
  expect(response?.headers()['content-security-policy']).toBeUndefined();
});

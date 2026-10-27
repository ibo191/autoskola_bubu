import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isInternalAdminPath } from '../../src/lib/admin-route';

test('GA/GTM exclusion covers the admin route and all nested paths only', () => {
  for (const path of ['/sprava', '/sprava/', '/sprava/action', '/sprava/schedule/nested']) {
    assert.equal(isInternalAdminPath(path), true);
  }
  for (const path of ['/', '/kladno', '/dekujeme', '/spravce', '/sprava-public']) {
    assert.equal(isInternalAdminPath(path), false);
  }
});

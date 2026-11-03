import test from 'node:test';
import assert from 'node:assert/strict';
import {
  groupSchema,
  invitationMessage,
  issueMemberToken,
  verifyMemberToken,
  schoolPrices,
  schoolSizes,
} from '../../src/lib/school-groups';
import { quote } from '../../src/lib/pricing/quote';
import { selectionLabel } from '../../src/lib/order-display';

const env = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'x'.repeat(64),
};
const member = (n: number) => ({
  firstName: `Žák${n}`,
  lastName: 'Test',
  email: `student${n}@example.cz`,
  phone: '777 123 456',
});

test('school group prices, size and server quote are fixed', () => {
  for (const courseType of ['school', 'isp'] as const) {
    const input = {
      submissionKey: crypto.randomUUID(),
      courseType,
      members: Array.from({ length: schoolSizes[courseType] }, (_, i) => member(i)),
      recaptchaToken: 'test',
    };
    const result = groupSchema.safeParse(input);
    assert.equal(result.success, true);
    const price = quote({
      branch: 'strizkov',
      course: 'b',
      package: 'single',
      partnerSchool: 'gymnazium_manna',
      schoolCourseType: courseType,
    });
    assert.equal(price.ok, true);
    if (price.ok) assert.equal(price.amount, schoolPrices[courseType]);
    assert.equal(
      groupSchema.safeParse({ ...input, members: input.members.slice(1) }).success,
      false,
    );
    assert.equal(
      groupSchema.safeParse({
        ...input,
        members: [input.members[0], ...input.members.slice(1).map(() => input.members[0])],
      }).success,
      false,
    );
  }
  assert.equal(
    quote({
      branch: 'kladno',
      course: 'b',
      partnerSchool: 'gymnazium_manna',
      schoolCourseType: 'school',
    }).ok,
    false,
  );
  const l17 = quote({
    branch: 'strizkov',
    course: 'l17',
    transmission: 'manual',
    partnerSchool: 'gymnazium_manna',
    schoolCourseType: 'isp',
  });
  assert.equal(l17.ok && l17.amount, 25900);
  assert.match(
    selectionLabel({
      branch: 'strizkov',
      course: 'l17',
      transmission: 'manual',
      package: 'single',
      heldLicences: [],
      partnerSchool: 'gymnazium_manna',
      schoolCourseType: 'isp',
    }),
    /Kurz ISP.*L17/,
  );
  assert.equal(
    quote({ branch: 'strizkov', course: 'b', partnerSchool: 'gymnazium_manna' }).ok,
    false,
  );
});

test('individual invitation token is signed and expires', () => {
  const id = crypto.randomUUID();
  const token = issueMemberToken(env, id, new Date().toISOString());
  assert.equal(verifyMemberToken(env, token), id);
  assert.equal(
    verifyMemberToken(env, token.slice(0, -1) + (token.endsWith('a') ? 'b' : 'a')),
    null,
  );
  const expired = issueMemberToken(env, id, new Date(Date.now() - 31 * 86400000).toISOString());
  assert.equal(verifyMemberToken(env, expired), null);
});

test('each invitation contains only its recipient, course price and a private decision link', () => {
  const createdAt = new Date().toISOString();
  const first = {
    id: crypto.randomUUID(),
    group_id: crypto.randomUUID(),
    first_name: 'Anna',
    last_name: 'Nová',
    email: 'anna@example.cz',
    phone: '+420777123456',
    confirmation_status: 'invited' as const,
    invitation_sent_at: null,
    reminder_sent_at: null,
    existing_order_id: null,
    created_at: createdAt,
  };
  const second = { ...first, id: crypto.randomUUID(), email: 'eva@example.cz' };
  const group = {
    id: first.group_id,
    course_type: 'isp' as const,
    status: 'invited',
    coordinator_id: first.id,
    created_at: createdAt,
  };
  const firstMail = invitationMessage(env, first, group, false);
  const secondMail = invitationMessage(env, second, group, false);
  assert.equal(firstMail.to, first.email);
  assert.match(firstMail.text, /Kurz ISP: 25\s*900 Kč za osobu/);
  assert.match(firstMail.text, /potvrď účast nebo pozvání odmítni/i);
  assert.match(firstMail.text, /ochrana-osobnich-udaju/);
  assert.doesNotMatch(firstMail.text, /eva@example.cz/);
  assert.notEqual(firstMail.text, secondMail.text);
  assert.equal(firstMail.idempotencyKey, `manna-invite-${first.id}`);
});

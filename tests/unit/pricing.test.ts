import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quote } from '../../src/lib/pricing/quote';
import {
  courses,
  branches,
  availableAt,
  fees,
  motoEnrollmentPausedMessage,
} from '../../src/lib/catalog';
for (const branch of branches)
  for (const course of ['b', 'b-automat', 'l17'])
    for (const transmission of ['manual', 'automatic']) {
      test(`B ${branch.id}/${course}/${transmission}`, () => {
        const result = quote({ course, branch: branch.id, transmission });
        const consistent =
          course === 'l17' ||
          (course === 'b' && transmission === 'manual') ||
          (course === 'b-automat' && transmission === 'automatic');
        const allowed =
          consistent &&
          (branch.id === 'strizkov' || (course !== 'b-automat' && transmission === 'manual'));
        assert.equal(result.ok, allowed);
        if (result.ok) {
          assert.equal(result.amount, branch.bPrice);
          assert.equal(result.package, 'single');
          assert.equal(result.schoolFee, 1000);
          assert.equal(result.authorityFee, 700);
        }
      });
    }
for (const course of ['am', 'a1', 'a2', 'a'])
  test(`${course}: enrollment is paused server-side`, () => {
    const result = quote({ course, branch: 'strizkov', package: 'moto-confidence' });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, 'UNAVAILABLE');
      assert.equal(result.message, motoEnrollmentPausedMessage);
    }
  });
test('Moto enrollment pause applies before a direct selection can create an offer', () => {
  const result = quote({
    course: 'a2',
    branch: 'strizkov',
    heldLicences: ['A1'],
    holdingPeriod: 'more-than-two',
    package: 'supplement',
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, 'UNAVAILABLE');
});
for (const [course, price] of [
  ['b96', 8000],
  ['be', 10500],
] as const)
  test(`${course} one price and Prague only`, () => {
    const r = quote({ course, branch: 'strizkov' });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.amount, price);
    for (const branch of ['kladno', 'statenice']) assert.equal(quote({ course, branch }).ok, false);
  });
test('No combined course or invented B package; client price rejected', () => {
  assert.equal(quote({ course: 'b+a', branch: 'strizkov' }).ok, false);
  assert.equal(quote({ course: 'b', branch: 'strizkov', package: 'moto-confidence' }).ok, false);
  assert.equal(quote({ course: 'b', branch: 'strizkov', amount: 1 }).ok, false);
  assert.ok(courses.every((c) => !c.id.includes('+')));
  assert.ok(courses.filter((c) => availableAt(c, 'kladno')).every((c) => c.category === 'auto'));
});
test('Published exam fees distinguish the first and repeated exam term', () => {
  assert.equal(fees.schoolOrganization, 1000);
  assert.equal(fees.schoolRepeatExam, 800);
});

test('Refresher blocks are priced server-side and automatic is restricted to Střížkov', () => {
  for (const branch of branches)
    for (const drivingBlocks of [1, 2, 20]) {
      const result = quote({ course: 'kondicni', branch: branch.id, drivingBlocks });
      assert.ok(result.ok);
      assert.equal(result.amount, drivingBlocks * 1600);
      assert.equal(result.schoolFee, 0);
      assert.equal(result.authorityFee, 0);
      assert.equal(
        quote({ course: 'kondicni', branch: branch.id, drivingBlocks, transmission: 'automatic' })
          .ok,
        branch.id === 'strizkov',
      );
    }
  for (const drivingBlocks of [undefined, 0, -1, 1.5, 21, '2'])
    assert.equal(quote({ course: 'kondicni', branch: 'strizkov', drivingBlocks }).ok, false);
  assert.equal(quote({ course: 'b', branch: 'strizkov', drivingBlocks: 2 }).ok, false);
  assert.equal(
    quote({ course: 'kondicni', branch: 'strizkov', drivingBlocks: 2, amount: 1 }).ok,
    false,
  );
});

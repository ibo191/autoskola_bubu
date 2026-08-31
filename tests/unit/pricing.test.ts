import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quote } from '../../src/lib/pricing/quote';
import { courses, branches, availableAt } from '../../src/lib/catalog';
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
for (const course of ['am', 'a1', 'a2', 'a']) {
  test(`${course}: no licence means only Jistota plus two theory hours`, () => {
    const selection = { course, branch: 'strizkov', heldLicences: [] };
    const rejected = quote({ ...selection, package: 'moto-basic' });
    assert.equal(rejected.ok, false);
    if (!rejected.ok) assert.deepEqual(rejected.allowedPackages, ['moto-confidence']);
    const accepted = quote({ ...selection, package: 'moto-confidence' });
    assert.equal(accepted.ok, true);
    if (accepted.ok) {
      assert.equal(accepted.amount, 31900);
      assert.equal(accepted.extraTheoryHours, 2);
    }
  });
  for (const branch of ['kladno', 'statenice'])
    test(`${course} forbidden in ${branch}`, () =>
      assert.equal(quote({ course, branch, package: 'moto-confidence' }).ok, false));
  for (const pkg of ['moto-basic', 'moto-confidence'])
    test(`${course} extension from B ${pkg}`, () => {
      const result = quote({ course, branch: 'strizkov', heldLicences: ['B'], package: pkg });
      assert.equal(result.ok, true);
      if (result.ok) {
        assert.equal(result.training, 'extension');
        assert.equal(result.amount, pkg === 'moto-basic' ? 24900 : 31900);
      }
    });
}
for (const [held, course] of [
  ['A1', 'a2'],
  ['A2', 'a'],
]) {
  test(`${held} to ${course}: over two years`, () => {
    const r = quote({
      course,
      branch: 'strizkov',
      heldLicences: [held],
      holdingPeriod: 'more-than-two',
      package: 'supplement',
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.amount, 7500);
      assert.equal(r.training, 'supplement');
    }
  });
  test(`${held} to ${course}: less than two years`, () => {
    const r = quote({
      course,
      branch: 'strizkov',
      heldLicences: [held],
      holdingPeriod: 'less-than-two',
      package: 'moto-basic',
    });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.amount, 24900);
  });
  for (const period of ['unknown', 'exactly-two'])
    test(`${held} to ${course}: ${period} fails closed`, () =>
      assert.equal(
        quote({
          course,
          branch: 'strizkov',
          heldLicences: [held],
          holdingPeriod: period,
          package: 'supplement',
        }).ok,
        false,
      ));
}
test('A1 to A is extension, never supplemental', () => {
  assert.equal(
    quote({ course: 'a', branch: 'strizkov', heldLicences: ['A1'], package: 'supplement' }).ok,
    false,
  );
  assert.equal(
    quote({ course: 'a', branch: 'strizkov', heldLicences: ['A1'], package: 'moto-basic' }).ok,
    true,
  );
});
test('Unknown, duplicate, same or higher moto licences need contact', () => {
  for (const heldLicences of [['other'], ['A'], ['A2'], ['A1', 'A1']])
    assert.equal(
      quote({ course: 'a2', branch: 'strizkov', heldLicences, package: 'moto-basic' }).ok,
      false,
    );
});
test('Multiple held groups use the highest relevant moto group', () => {
  const supplement = quote({
    course: 'a2',
    branch: 'strizkov',
    heldLicences: ['B', 'A1'],
    holdingPeriod: 'more-than-two',
    package: 'supplement',
  });
  assert.equal(supplement.ok, true);
  if (supplement.ok) assert.equal(supplement.amount, 7500);
  const extension = quote({
    course: 'a',
    branch: 'strizkov',
    heldLicences: ['AM', 'B', 'A1'],
    package: 'moto-basic',
  });
  assert.equal(extension.ok, true);
  if (extension.ok) assert.equal(extension.training, 'extension');
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

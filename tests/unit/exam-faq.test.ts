import { test } from 'node:test';
import assert from 'node:assert/strict';
import { examFaq, filterExamFaq, normalizeExamSearch } from '../../src/lib/exam-faq';
import { examQuestionSchema } from '../../src/lib/exam-question';
import { POST as submitExamQuestion } from '../../src/pages/api/exam-question';

test('exam FAQ has stable unique IDs and finds words without accents', () => {
  assert.equal(examFaq.length, 30);
  assert.equal(new Set(examFaq.map((item) => item.id)).size, 30);
  assert.equal(normalizeExamSearch('  OPRAVNÁ   ZKOUŠKA  '), 'opravna zkouska');
  assert.ok(filterExamFaq(examFaq, 'opravna zkouska').length > 0);
  assert.ok(filterExamFaq(examFaq, 'doklady obcanka').length > 0);
  assert.equal(filterExamFaq(examFaq, 'nenaleznutelnydotaz').length, 0);
});

test('exam location and process direct students to the SMS and assigned exam venue', () => {
  const location = examFaq.find((item) => item.id === 'exam-08');
  const process = examFaq.find((item) => item.id === 'exam-13');
  assert.match(location?.answer ?? '', /místo konání zkoušky.*SMS/);
  assert.match(process?.answer ?? '', /testu na počítači/);
  assert.match(process?.answer ?? '', /Místo praktické zkoušky přiděluje úřad/);
});

test('exam question requires validated contact and normalizes Czech phone variants', () => {
  const valid = {
    firstName: ' Jan ',
    lastName: ' Novák ',
    email: ' JAN@EXAMPLE.CZ ',
    phone: '725 717 755',
    branch: 'strizkov',
    message: ' Kdy mám zkoušku? ',
    website: '',
    recaptchaToken: 'token',
  };
  const parsed = examQuestionSchema.parse(valid);
  assert.equal(parsed.phone, '+420725717755');
  assert.equal(parsed.email, 'jan@example.cz');
  assert.equal(
    examQuestionSchema.parse({ ...valid, phone: '+420 725 717 755' }).phone,
    parsed.phone,
  );
  for (const changed of [
    { firstName: '   ' },
    { email: 'bad-address' },
    { phone: '123' },
    { message: '   ' },
    { website: 'spam' },
    { branch: 'unknown' },
  ]) {
    assert.equal(examQuestionSchema.safeParse({ ...valid, ...changed }).success, false);
  }
});

test('exam endpoint rejects missing CAPTCHA token before any email operation', async () => {
  const response = await submitExamQuestion({
    request: new Request('https://www.autoskolabubu.cz/api/exam-question', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: 'Jan',
        lastName: 'Novák',
        email: 'jan@example.cz',
        phone: '725717755',
        branch: 'strizkov',
        message: 'Kdy mám zkoušku?',
        website: '',
      }),
    }),
  } as Parameters<typeof submitExamQuestion>[0]);
  assert.equal(response?.status, 422);
});

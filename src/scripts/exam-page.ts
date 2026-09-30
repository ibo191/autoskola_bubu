import { examFaq, filterExamFaq } from '../lib/exam-faq';
import { getRecaptchaToken } from './recaptcha';

const steps = document.querySelector<HTMLOListElement>('.exam-steps');
const stepButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-exam-step]'));
const stepDetails = Array.from(document.querySelectorAll<HTMLElement>('[data-exam-step-detail]'));
stepButtons.forEach((button, index) => {
  button.addEventListener('click', () => {
    stepButtons.forEach((step, stepIndex) => {
      const active = stepIndex === index;
      step.setAttribute('aria-pressed', String(active));
      step.setAttribute('aria-expanded', String(active));
      step.closest('li')?.classList.toggle('active', active);
    });
    stepDetails.forEach((detail, detailIndex) => (detail.hidden = detailIndex !== index));
    if (steps) steps.dataset.examProgress = String(index);
  });
});

const search = document.querySelector<HTMLInputElement>('[data-exam-search]');
const count = document.querySelector<HTMLElement>('[data-exam-count]');
const empty = document.querySelector<HTMLElement>('[data-exam-empty]');
const items = new Map(
  Array.from(document.querySelectorAll<HTMLDetailsElement>('[data-exam-id]')).map((node) => [
    node.dataset.examId!,
    node,
  ]),
);
const chips = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-exam-chip]'));

function track(name: string) {
  // The existing Google tag listener forwards this only after analytics consent.
  window.dispatchEvent(new CustomEvent('bubu:tracking', { detail: { name } }));
}

let searchTimer: number | undefined;
function applySearch() {
  if (!search || !count || !empty) return;
  const result = filterExamFaq(examFaq, search.value);
  const visible = new Set(result.map((item) => item.id));
  for (const [id, node] of items) node.hidden = !visible.has(id);
  count.textContent = `Zobrazeno ${result.length} ${result.length === 1 ? 'otázka' : result.length < 5 ? 'otázky' : 'otázek'}`;
  empty.hidden = result.length !== 0;
  for (const chip of chips) {
    chip.setAttribute('aria-pressed', String(chip.dataset.examChip === search.value));
  }
  window.clearTimeout(searchTimer);
  if (search.value.trim()) searchTimer = window.setTimeout(() => track('exam_faq_search'), 500);
}
search?.addEventListener('input', applySearch);
for (const chip of chips) {
  chip.setAttribute('aria-pressed', 'false');
  chip.addEventListener('click', () => {
    if (!search) return;
    search.value = chip.dataset.examChip ?? '';
    applySearch();
    search.focus();
  });
}
for (const node of items.values()) {
  node.addEventListener('toggle', () => {
    node.querySelector('summary')?.setAttribute('aria-expanded', String(node.open));
    if (node.open) track('exam_faq_open');
  });
}

const form = document.querySelector<HTMLFormElement>('[data-exam-form]');
const error = document.querySelector<HTMLElement>('[data-exam-form-error]');
const success = document.querySelector<HTMLElement>('[data-exam-success]');
let started = false;
let sending = false;
form?.addEventListener('focusin', () => {
  if (started) return;
  started = true;
  track('exam_contact_form_start');
});
form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!form || !error || !success || sending) return;
  error.hidden = true;
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }
  sending = true;
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  button.disabled = true;
  button.textContent = 'Odesíláme…';
  track('exam_contact_form_submit');
  try {
    const data = new FormData(form);
    const recaptchaToken = await getRecaptchaToken('exam_contact');
    const response = await fetch('/api/exam-question', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: String(data.get('firstName') ?? ''),
        lastName: String(data.get('lastName') ?? ''),
        email: String(data.get('email') ?? ''),
        phone: String(data.get('phone') ?? ''),
        branch: String(data.get('branch') ?? ''),
        message: String(data.get('message') ?? ''),
        website: String(data.get('website') ?? ''),
        recaptchaToken,
      }),
    });
    if (!response.ok || !(await response.json().catch(() => ({ ok: false }))).ok) {
      throw new Error('EXAM_CONTACT_FAILED');
    }
    form.hidden = true;
    success.hidden = false;
    success.scrollIntoView({ behavior: 'smooth', block: 'center' });
    track('exam_contact_form_success');
  } catch {
    error.hidden = false;
    track('exam_contact_form_error');
  } finally {
    sending = false;
    button.disabled = false;
    button.textContent = 'Odeslat dotaz';
  }
});

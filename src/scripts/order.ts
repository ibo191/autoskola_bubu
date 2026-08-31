import { money } from '../lib/format';
import type { Quote, Selection } from '../lib/pricing/quote';

const dialog = document.querySelector<HTMLDialogElement>('#order-dialog')!;
const form = document.querySelector<HTMLFormElement>('#order-form')!;
const field = (name: string) =>
  form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement;
const error = document.querySelector<HTMLElement>('#order-error')!;
const next = document.querySelector<HTMLButtonElement>('#order-next')!;
const back = document.querySelector<HTMLButtonElement>('#order-back')!;
const question = document.querySelector<HTMLElement>('#discard-question')!;
let step = 0,
  dirty = false,
  validQuote: Extract<Quote, { ok: true }> | undefined,
  trigger: HTMLElement | undefined,
  requestSequence = 0;
const packageLabels: Record<Selection['package'], string> = {
  single: 'Jednotná cena',
  'moto-basic': 'Moto Základ · 13 hodin jízd',
  'moto-confidence': 'Moto Jistota · 20 hodin jízd',
  supplement: 'Doplňovací zkouška · 4 hodiny jízd',
};
function setStep(value: number) {
  step = value;
  document
    .querySelectorAll<HTMLElement>('[data-step]')
    .forEach((el) => (el.hidden = Number(el.dataset.step) !== step));
  document.querySelectorAll('.wizard-steps li').forEach((el, i) => {
    if (i === step) el.setAttribute('aria-current', 'step');
    else el.removeAttribute('aria-current');
  });
  back.hidden = step === 0;
  next.hidden = step === 2;
  error.textContent = '';
  if (step === 2)
    document.querySelector('#order-summary')!.textContent =
      `${(field('course') as HTMLSelectElement).selectedOptions[0]?.textContent} · ${(field('branch') as HTMLSelectElement).selectedOptions[0]?.textContent} · ${validQuote ? money(validQuote.amount) : ''}`;
  form
    .querySelector<HTMLElement>(
      `[data-step="${step}"] input,[data-step="${step}"] select,[data-step="${step}"] .notice`,
    )
    ?.focus();
}
function reset() {
  form.reset();
  dirty = false;
  validQuote = undefined;
  question.hidden = true;
  setStep(0);
}
function requestClose() {
  if (dirty) {
    question.hidden = false;
    document.querySelector<HTMLButtonElement>('#keep-order')!.focus();
  } else dialog.close();
}
document.querySelectorAll<HTMLElement>('[data-order]').forEach((button) => {
  button.addEventListener('click', () => {
    trigger = button;
    reset();
    field('course').value = button.dataset.course ?? '';
    field('branch').value = button.dataset.branch ?? '';
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    void updateQuote();
  });
  button.removeAttribute('disabled');
});
dialog.addEventListener('cancel', (e) => {
  e.preventDefault();
  requestClose();
});
dialog.addEventListener('keydown', (event) => {
  if (event.key !== 'Tab') return;
  const focusable = Array.from(
    dialog.querySelectorAll<HTMLElement>('a[href],button,input,select,textarea,[tabindex]'),
  ).filter(
    (el) =>
      el.tabIndex >= 0 &&
      !el.matches(':disabled') &&
      !el.closest('[hidden]') &&
      el.getClientRects().length > 0,
  );
  const first = focusable[0],
    last = focusable.at(-1);
  if (!first || !last) {
    event.preventDefault();
    return;
  }
  if (
    event.shiftKey &&
    (document.activeElement === first || !dialog.contains(document.activeElement))
  ) {
    event.preventDefault();
    last.focus();
  } else if (
    !event.shiftKey &&
    (document.activeElement === last || !dialog.contains(document.activeElement))
  ) {
    event.preventDefault();
    first.focus();
  }
});
dialog.addEventListener('close', () => {
  document.body.style.overflow = '';
  trigger?.focus();
});
document.querySelector('.close-dialog')!.addEventListener('click', requestClose);
document.querySelector('#keep-order')!.addEventListener('click', () => {
  question.hidden = true;
  next.focus();
});
document.querySelector('#discard-order')!.addEventListener('click', () => {
  reset();
  dialog.close();
});
form.addEventListener('submit', (e) => e.preventDefault());
form.addEventListener('input', () => {
  dirty = true;
});
form.addEventListener('change', (event) => {
  if ((event.target as HTMLElement).tagName === 'SELECT') void updateQuote();
});
back.addEventListener('click', () => setStep(step - 1));
next.addEventListener('click', () => {
  if (step === 0 && !validQuote) {
    error.textContent = 'Nejdříve vyberte dostupnou kombinaci kurzu a pobočky.';
    return;
  }
  const fields = form.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
    `[data-step="${step}"] input,[data-step="${step}"] select`,
  );
  for (const el of fields) {
    if (el.closest('[hidden]')) continue;
    if (!el.checkValidity()) {
      error.textContent = el.validationMessage;
      el.reportValidity();
      return;
    }
  }
  setStep(step + 1);
});
async function updateQuote(retry = false) {
  const seq = ++requestSequence;
  validQuote = undefined;
  next.disabled = true;
  error.textContent = '';
  const course = field('course').value,
    branch = field('branch').value,
    moto = ['am', 'a1', 'a2', 'a'].includes(course);
  document.querySelector<HTMLElement>('#licence-field')!.hidden = !moto;
  const direct =
    (field('heldLicence').value === 'A1' && course === 'a2') ||
    (field('heldLicence').value === 'A2' && course === 'a');
  document.querySelector<HTMLElement>('#period-field')!.hidden = !moto || !direct;
  document.querySelector<HTMLElement>('#package-field')!.hidden = !moto;
  document.querySelector<HTMLElement>('#transmission-field')!.hidden = course !== 'l17';
  const amount = document.querySelector<HTMLElement>('#quote-amount')!,
    note = document.querySelector<HTMLElement>('#quote-note')!;
  if (!course || !branch) {
    amount.textContent = 'Vyberte kurz a pobočku';
    note.textContent = '';
    return;
  }
  amount.textContent = 'Ověřujeme cenu…';
  const selection = {
    course,
    branch,
    transmission:
      course === 'b-automat'
        ? 'automatic'
        : course === 'l17'
          ? field('transmission').value
          : 'manual',
    package: moto ? field('package').value : 'single',
    heldLicences: moto && field('heldLicence').value ? [field('heldLicence').value] : [],
    ...(moto && direct ? { holdingPeriod: field('holdingPeriod').value } : {}),
  };
  try {
    const response = await fetch('/api/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(selection),
    });
    const result = (await response.json()) as Quote;
    if (seq !== requestSequence) return;
    if (!result.ok) {
      if (result.code === 'PACKAGE_REQUIRED' && result.allowedPackages && !retry) {
        const options = field('package') as HTMLSelectElement;
        options.replaceChildren(
          ...result.allowedPackages.map((value) => new Option(packageLabels[value], value)),
        );
        await updateQuote(true);
        return;
      }
      amount.textContent = 'Výběr je potřeba upřesnit';
      note.textContent = result.message;
      return;
    }
    if (moto) {
      const options = field('package') as HTMLSelectElement;
      const allowed: Selection['package'][] =
        result.training === 'supplement'
          ? ['supplement']
          : selection.heldLicences.length === 0
            ? ['moto-confidence']
            : ['moto-basic', 'moto-confidence'];
      const selected = options.value;
      options.replaceChildren(...allowed.map((value) => new Option(packageLabels[value], value)));
      options.value = selected;
    }
    validQuote = result;
    amount.textContent = money(result.amount);
    note.textContent = `Samostatně: organizace zkoušky ${money(result.schoolFee)}, úřední poplatek za první zkoušku ${money(result.authorityFee)}.${result.extraTheoryHours ? ' Součástí jsou také 2 hodiny teorie navíc.' : ''}`;
    next.disabled = false;
  } catch {
    if (seq !== requestSequence) return;
    amount.textContent = 'Cenu se nepodařilo ověřit';
    note.textContent = 'Zkuste výběr znovu. Bez serverového ověření nelze pokračovat.';
  }
}

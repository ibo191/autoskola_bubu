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
  requestSequence = 0,
  slotSequence = 0;
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
  if (step === 2) {
    document.querySelector('#order-summary')!.textContent =
      `${(field('course') as HTMLSelectElement).selectedOptions[0]?.textContent} · ${(field('branch') as HTMLSelectElement).selectedOptions[0]?.textContent} · ${validQuote ? money(validQuote.amount) : ''}`;
    void loadSlots();
  }
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
form.addEventListener('submit', (event) => {
  event.preventDefault();
  void submitOrder();
});
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

function formatSlot(start: string, end: string) {
  const from = new Date(start);
  const to = new Date(end);
  const day = new Intl.DateTimeFormat('cs-CZ', {
    weekday: 'short',
    day: 'numeric',
    month: 'numeric',
    timeZone: 'Europe/Prague',
  }).format(from);
  const time = new Intl.DateTimeFormat('cs-CZ', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Prague',
  }).format(from);
  const until = new Intl.DateTimeFormat('cs-CZ', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Prague',
  }).format(to);
  return `${day} · ${time}–${until}`;
}

async function loadSlots() {
  const seq = ++slotSequence;
  const slot = field('slotId') as HTMLSelectElement;
  const branch = field('branch').value;
  slot.replaceChildren(new Option('Načítáme dostupné termíny…', ''));
  slot.disabled = true;
  try {
    const response = await fetch(`/api/slots?branch=${encodeURIComponent(branch)}`, {
      headers: { Accept: 'application/json' },
    });
    const result = (await response.json()) as {
      ok: boolean;
      slots?: { id: string; startsAt: string; endsAt: string }[];
      message?: string;
    };
    if (seq !== slotSequence) return;
    if (!response.ok || !result.ok || !result.slots?.length) {
      slot.replaceChildren(
        new Option(result.message ?? 'Pro tuto pobočku nejsou vypsané termíny', ''),
      );
      return;
    }
    slot.replaceChildren(
      new Option('Vyberte termín zápisu', ''),
      ...result.slots.map(
        (value) => new Option(formatSlot(value.startsAt, value.endsAt), value.id),
      ),
    );
    slot.disabled = false;
  } catch {
    if (seq !== slotSequence) return;
    slot.replaceChildren(new Option('Termíny se nepodařilo načíst', ''));
  }
}

async function submitOrder() {
  if (!validQuote) {
    error.textContent = 'Nejdříve vyberte dostupný kurz.';
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
  const submit = document.querySelector<HTMLButtonElement>('#order-submit')!;
  submit.disabled = true;
  submit.textContent = 'Odesíláme…';
  error.textContent = '';
  const course = field('course').value;
  const moto = ['am', 'a1', 'a2', 'a'].includes(course);
  const heldLicence = field('heldLicence').value;
  const heldLicences = moto && heldLicence ? [heldLicence] : [];
  const direct =
    (heldLicence === 'A1' && course === 'a2') || (heldLicence === 'A2' && course === 'a');
  const body = {
    slotId: field('slotId').value,
    contact: {
      firstName: field('firstName').value,
      lastName: field('lastName').value,
      email: field('email').value,
      phone: field('phone').value,
    },
    selection: {
      course,
      branch: field('branch').value,
      transmission:
        course === 'b-automat'
          ? 'automatic'
          : course === 'l17'
            ? field('transmission').value
            : 'manual',
      package: moto ? field('package').value : 'single',
      heldLicences,
      ...(moto && direct ? { holdingPeriod: field('holdingPeriod').value } : {}),
    },
    priceVersion: validQuote.priceVersion,
    termsAccepted: (field('terms') as HTMLInputElement).checked,
    marketingAccepted: (field('marketing') as HTMLInputElement).checked,
  };
  try {
    const response = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const result = (await response.json()) as { ok: boolean; code?: string; expiresAt?: string };
    if (!response.ok || !result.ok) {
      error.textContent =
        result.code === 'RATE_LIMITED'
          ? 'Odeslali jste příliš mnoho pokusů. Zkuste to prosím později.'
          : 'Objednávku se nepodařilo uložit. Zkontrolujte výběr a zkuste to znovu.';
      submit.disabled = false;
      submit.textContent = 'Odeslat objednávku';
      return;
    }
    dirty = false;
    form.innerHTML =
      '<div class="notice"><strong>Objednávka je přijatá.</strong><p>Termín zápisu jsme vám podrželi. Brzy vás budeme kontaktovat s dalšími informacemi.</p></div>';
  } catch {
    error.textContent = 'Objednávku se nepodařilo odeslat. Zkuste to prosím znovu.';
    submit.disabled = false;
    submit.textContent = 'Odeslat objednávku';
  }
}

import { money } from '../lib/format';
import type { Quote, Selection } from '../lib/pricing/quote';

type Slot = { id: string; branch: string; startsAt: string; endsAt: string; remaining: number };

const dialog = document.querySelector<HTMLDialogElement>('#order-dialog')!;
const form = document.querySelector<HTMLFormElement>('#order-form')!;
const field = (name: string) =>
  form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement;
const error = document.querySelector<HTMLElement>('#order-error')!;
const next = document.querySelector<HTMLButtonElement>('#order-next')!;
const back = document.querySelector<HTMLButtonElement>('#order-back')!;
const question = document.querySelector<HTMLElement>('#discard-question')!;
const slotField = document.querySelector<HTMLInputElement>('#slot-field')!;
const calendarTitle = document.querySelector<HTMLElement>('#calendar-title')!;
const calendarDays = document.querySelector<HTMLElement>('#calendar-days')!;
const slotList = document.querySelector<HTMLElement>('#slot-list')!;
const motoPackageCards = document.querySelector<HTMLElement>('#moto-package-cards')!;
const motoPackageOptions = document.querySelector<HTMLElement>('#moto-package-options')!;
let step = 0;
let dirty = false;
let validQuote: Extract<Quote, { ok: true }> | undefined;
let trigger: HTMLElement | undefined;
let requestSequence = 0;
let slotSequence = 0;
let monthCursor = new Date();
let loadedSlots: Slot[] = [];
let selectedDate = '';

const packageLabels: Record<Selection['package'], string> = {
  single: 'Jednotná cena',
  'moto-basic': 'Moto Základ · 13 hodin jízd',
  'moto-confidence': 'Moto Jistota · 20 hodin jízd',
  supplement: 'Doplňovací zkouška · 4 hodiny jízd',
};
const motoPackageCopy: Record<
  Selection['package'],
  { title: string; price: string; recommended?: boolean; benefits: string[] }
> = {
  single: { title: 'Jednotná cena', price: '', benefits: [] },
  'moto-basic': {
    title: 'MOTO ZÁKLAD',
    price: '24 900 Kč',
    benefits: [
      'Zákonný rozsah výcviku 13 hodin jízd.',
      'Vhodné pro ty, kteří už mají zkušenosti na motorce.',
      'Vhodné na procvičení základů ovládání motorky a cvičiště ke zkoušce.',
    ],
  },
  'moto-confidence': {
    title: 'MOTO JISTOTA',
    price: '31 900 Kč',
    recommended: true,
    benefits: [
      'Rozsah nad rámec zákona 20 hodin jízd.',
      'Vhodné pro úplné začátečníky na motorce.',
      'Více času na ovládání motorky, bezpečnost a sebevědomí před zkouškou.',
    ],
  },
  supplement: {
    title: 'DOPLŇOVACÍ ZKOUŠKA',
    price: '7 500 Kč',
    benefits: [
      'Pro zákonné rozšíření po dostatečné době držení nižší skupiny.',
      'Obsahuje 4 hodiny jízd.',
      'Pobočka ověří, že splňujete podmínky pro doplňovací zkoušku.',
    ],
  },
};
const firstLicenceCopy = {
  title: 'MOTO JISTOTA prvořidičák',
  price: '31 900 Kč',
  recommended: true,
  benefits: [
    'Pro ty, kteří si dělají svůj první řidičák právě na skupinu A1.',
    'Hodinový rozsah jízd nad rámec zákona: 20 hodin.',
    'Rozšířený rozsah teoretické přípravy nad rámec zákona.',
  ],
};

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function renderMotoPackageCards(allowed: Selection['package'][], selected: Selection['package']) {
  motoPackageOptions.replaceChildren();
  motoPackageOptions.classList.toggle('single', allowed.length === 1);
  const course = field('course').value;
  const heldLicence = field('heldLicence').value;
  const isFirstLicenceA1 =
    course === 'a1' && !heldLicence && allowed.length === 1 && allowed[0] === 'moto-confidence';
  for (const value of allowed) {
    const copy =
      isFirstLicenceA1 && value === 'moto-confidence' ? firstLicenceCopy : motoPackageCopy[value];
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `moto-package-card${copy.recommended ? ' recommended' : ''}`;
    button.dataset.package = value;
    button.setAttribute('aria-pressed', String(value === selected));
    const benefits = copy.benefits.map((benefit) => `<li>${benefit}</li>`).join('');
    button.innerHTML = `<h4>${copy.title}</h4><strong class="package-price">${copy.price}</strong><ul>${benefits}</ul>`;
    button.addEventListener('click', () => {
      field('package').value = value;
      renderMotoPackageCards(allowed, value);
      void updateQuote();
    });
    motoPackageOptions.append(button);
  }
}
function selectionWithAddons() {
  const course = field('course').value;
  const moto = ['am', 'a1', 'a2', 'a'].includes(course);
  const heldLicence = field('heldLicence').value;
  const direct =
    (heldLicence === 'A1' && course === 'a2') || (heldLicence === 'A2' && course === 'a');
  return {
    course,
    branch: field('branch').value,
    transmission:
      course === 'b-automat'
        ? 'automatic'
        : course === 'l17'
          ? field('transmission').value
          : 'manual',
    package: moto ? field('package').value : 'single',
    heldLicences: moto && heldLicence ? [heldLicence] : [],
    ...(moto && direct ? { holdingPeriod: field('holdingPeriod').value } : {}),
    addons: {
      book: (field('addonBook') as HTMLInputElement).checked,
      hoodieQty: Number(field('addonHoodieQty').value || 0),
      shirtQty: Number(field('addonShirtQty').value || 0),
    },
  };
}

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
    const course = (field('course') as HTMLSelectElement).selectedOptions[0]?.textContent;
    const branch = (field('branch') as HTMLSelectElement).selectedOptions[0]?.textContent;
    const addons = validQuote?.addons.length
      ? ` · Doplňky: ${validQuote.addons.map((item) => `${item.title} × ${item.quantity}`).join(', ')}`
      : '';
    document.querySelector('#order-summary')!.textContent =
      `${course} · ${branch} · ${validQuote ? money(validQuote.amount) : ''}${addons}`;
    slotField.value = '';
    selectedDate = '';
    monthCursor = new Date();
    monthCursor.setDate(1);
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
  loadedSlots = [];
  selectedDate = '';
  slotField.value = '';
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
  const first = focusable[0];
  const last = focusable.at(-1);
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
form.addEventListener('submit', (event) => {
  event.preventDefault();
  void submitOrder();
});
form.addEventListener('input', () => {
  dirty = true;
});
form.addEventListener('change', () => {
  void updateQuote();
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
document.querySelector('#calendar-prev')!.addEventListener('click', () => {
  monthCursor.setMonth(monthCursor.getMonth() - 1);
  void loadSlots();
});
document.querySelector('#calendar-next')!.addEventListener('click', () => {
  monthCursor.setMonth(monthCursor.getMonth() + 1);
  void loadSlots();
});

async function updateQuote(retry = false) {
  const seq = ++requestSequence;
  validQuote = undefined;
  next.disabled = true;
  error.textContent = '';
  const course = field('course').value;
  const branch = field('branch').value;
  const moto = ['am', 'a1', 'a2', 'a'].includes(course);
  document.querySelector<HTMLElement>('#licence-field')!.hidden = !moto;
  const direct =
    (field('heldLicence').value === 'A1' && course === 'a2') ||
    (field('heldLicence').value === 'A2' && course === 'a');
  document.querySelector<HTMLElement>('#period-field')!.hidden = !moto || !direct;
  document.querySelector<HTMLElement>('#package-field')!.hidden = !moto;
  motoPackageCards.hidden = !moto;
  document.querySelector<HTMLElement>('#transmission-field')!.hidden = course !== 'l17';
  const amount = document.querySelector<HTMLElement>('#quote-amount')!;
  const note = document.querySelector<HTMLElement>('#quote-note')!;
  if (!course || !branch) {
    amount.textContent = 'Vyberte kurz a pobočku';
    note.textContent = '';
    return;
  }
  amount.textContent = 'Ověřujeme cenu…';
  const selection = selectionWithAddons();
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
        const fallback = result.allowedPackages[0] ?? 'moto-confidence';
        options.replaceChildren(
          ...result.allowedPackages.map((value) => new Option(packageLabels[value], value)),
        );
        options.value = fallback;
        renderMotoPackageCards(result.allowedPackages, fallback);
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
      options.value = allowed.includes(selected as Selection['package'])
        ? selected
        : (allowed[0] ?? 'moto-confidence');
      renderMotoPackageCards(allowed, options.value as Selection['package']);
    }
    validQuote = result;
    amount.textContent = money(result.amount);
    const addonsNote = result.addonsAmount ? ` Doplňky: ${money(result.addonsAmount)}.` : '';
    note.textContent = `Kurz: ${money(result.baseAmount)}.${addonsNote} Samostatně: organizace zkoušky ${money(result.schoolFee)}, úřední poplatek za první zkoušku ${money(result.authorityFee)}.${result.extraTheoryHours ? ' Součástí jsou také 2 hodiny teorie navíc.' : ''}`;
    next.disabled = false;
  } catch {
    if (seq !== requestSequence) return;
    amount.textContent = 'Cenu se nepodařilo ověřit';
    note.textContent = 'Zkuste výběr znovu. Bez serverového ověření nelze pokračovat.';
  }
}

function formatSlotTime(start: string, end: string) {
  const from = new Date(start);
  const to = new Date(end);
  return `${new Intl.DateTimeFormat('cs-CZ', { hour: '2-digit', minute: '2-digit' }).format(from)}–${new Intl.DateTimeFormat('cs-CZ', { hour: '2-digit', minute: '2-digit' }).format(to)}`;
}

function renderSlotsForDate(date: string) {
  const slots = loadedSlots.filter((slot) => localDateKey(new Date(slot.startsAt)) === date);
  slotList.replaceChildren();
  slotField.value = '';
  if (!slots.length) {
    slotList.innerHTML = '<p>Pro tento den už nejsou volné časy.</p>';
    return;
  }
  for (const slot of slots) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'slot-option';
    button.textContent = formatSlotTime(slot.startsAt, slot.endsAt);
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => {
      slotField.value = slot.id;
      slotList
        .querySelectorAll('.slot-option')
        .forEach((item) => item.setAttribute('aria-pressed', 'false'));
      button.setAttribute('aria-pressed', 'true');
      error.textContent = '';
    });
    slotList.append(button);
  }
}

function renderCalendar() {
  const availableDates = new Set(loadedSlots.map((slot) => localDateKey(new Date(slot.startsAt))));
  calendarDays.replaceChildren();
  calendarTitle.textContent = new Intl.DateTimeFormat('cs-CZ', {
    month: 'long',
    year: 'numeric',
  }).format(monthCursor);
  const first = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0).getDate();
  for (let i = 0; i < offset; i += 1) calendarDays.append(document.createElement('span'));
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), day);
    const key = localDateKey(date);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'calendar-day';
    button.textContent = String(day);
    button.disabled = !availableDates.has(key);
    if (availableDates.has(key)) button.classList.add('available');
    if (selectedDate === key) button.classList.add('selected');
    button.addEventListener('click', () => {
      selectedDate = key;
      renderCalendar();
      renderSlotsForDate(key);
    });
    calendarDays.append(button);
  }
  if (!selectedDate) slotList.innerHTML = '<p>Vyberte zvýrazněný den v kalendáři.</p>';
}

async function loadSlots() {
  const branch = field('branch').value;
  const seq = ++slotSequence;
  loadedSlots = [];
  slotField.value = '';
  selectedDate = '';
  calendarTitle.textContent = 'Načítáme termíny…';
  calendarDays.replaceChildren();
  slotList.innerHTML = '<p>Načítáme volné termíny…</p>';
  if (!branch) return;
  const from = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1);
  const to = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0);
  try {
    const response = await fetch(
      `/api/slots?branch=${encodeURIComponent(branch)}&from=${localDateKey(from)}&to=${localDateKey(to)}`,
    );
    const result = (await response.json()) as { ok: boolean; slots?: Slot[]; message?: string };
    if (seq !== slotSequence) return;
    if (!response.ok || !result.ok || !result.slots?.length) {
      calendarTitle.textContent = new Intl.DateTimeFormat('cs-CZ', {
        month: 'long',
        year: 'numeric',
      }).format(monthCursor);
      slotList.innerHTML = `<p>${result.message ?? 'Pro tuto pobočku nejsou vypsané termíny.'}</p>`;
      renderCalendar();
      return;
    }
    loadedSlots = result.slots;
    renderCalendar();
  } catch {
    if (seq !== slotSequence) return;
    calendarTitle.textContent = 'Termíny se nepodařilo načíst';
    slotList.innerHTML = '<p>Zkuste to prosím znovu.</p>';
  }
}

async function submitOrder() {
  if (!validQuote) {
    error.textContent = 'Nejdříve vyberte dostupný kurz.';
    return;
  }
  if (!slotField.value) {
    error.textContent = 'Vyberte prosím termín zápisu v kalendáři.';
    slotField.reportValidity();
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
  const body = {
    slotId: slotField.value,
    contact: {
      firstName: field('firstName').value,
      lastName: field('lastName').value,
      email: field('email').value,
      phone: field('phone').value,
    },
    selection: selectionWithAddons(),
    priceVersion: validQuote.priceVersion,
    termsAccepted: (field('terms') as HTMLInputElement).checked,
    privacyAccepted: (field('privacy') as HTMLInputElement).checked,
    marketingAccepted: (field('marketing') as HTMLInputElement).checked,
  };
  try {
    const response = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const result = (await response.json()) as {
      ok: boolean;
      code?: string;
      thankYouUrl?: string;
      publicCode?: string;
    };
    if (!response.ok || !result.ok) {
      error.textContent =
        result.code === 'RATE_LIMITED'
          ? 'Odeslali jste příliš mnoho pokusů. Zkuste to prosím později.'
          : result.code === 'BOOKING_NOT_CONFIGURED'
            ? 'Objednávky jsou v rozhraní spuštěné, ale server ještě nemá nastavenou databázi Supabase.'
            : 'Objednávku se nepodařilo uložit. Zkontrolujte výběr a zkuste to znovu.';
      submit.disabled = false;
      submit.textContent = 'Odeslat objednávku';
      return;
    }
    dirty = false;
    window.location.href =
      result.thankYouUrl ?? `/dekujeme?kod=${encodeURIComponent(result.publicCode ?? '')}`;
  } catch {
    error.textContent = 'Objednávku se nepodařilo odeslat. Zkuste to prosím znovu.';
    submit.disabled = false;
    submit.textContent = 'Odeslat objednávku';
  }
}

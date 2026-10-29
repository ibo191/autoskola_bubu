import type { Quote } from '../lib/pricing/quote';

type Course = { id: string; label: string; name: string; description: string; slug: string };
type Step =
  | 'category'
  | 'branch'
  | 'transmission'
  | 'drivingBlocks'
  | 'mode'
  | 'motoTarget'
  | 'licenceStatus'
  | 'licences'
  | 'period'
  | 'package'
  | 'trailer'
  | 'result';
type Selection = {
  category: string;
  branch: string;
  transmission: string;
  mode: string;
  motoTarget: string;
  licenceStatus: string;
  period: string;
  package: string;
  trailer: string;
  drivingBlocks: number;
};
const catalog = JSON.parse(
  document.querySelector('#course-catalog')?.textContent ?? '[]',
) as Course[];
const state: Selection = {
  category: '',
  branch: '',
  transmission: '',
  mode: '',
  motoTarget: '',
  licenceStatus: '',
  period: '',
  package: '',
  trailer: '',
  drivingBlocks: 0,
};
const initialBranch = new URLSearchParams(location.search).get('branch');
if (initialBranch && ['strizkov', 'kladno', 'statenice'].includes(initialBranch))
  state.branch = initialBranch;
let active: Step = 'category';
let quoteSequence = 0;
let funnelStarted = false;
let packageNeeded = false;
let completedSignature = '';
const $ = <T extends HTMLElement = HTMLElement>(selector: string) =>
  document.querySelector<T>(selector)!;
const show = (selector: string, visible: boolean) => {
  $(selector).hidden = !visible;
};
const money = (amount: number) =>
  new Intl.NumberFormat('cs-CZ', {
    style: 'currency',
    currency: 'CZK',
    maximumFractionDigits: 0,
  }).format(amount);
const heldLicences = () =>
  [...document.querySelectorAll<HTMLInputElement>('input[name="held-licence"]:checked')].map(
    (input) => input.value,
  );
const track = (name: string, extra: Record<string, string | number> = {}) =>
  window.dispatchEvent(
    new CustomEvent('bubu:tracking', {
      detail: {
        name,
        ...(state.category ? { courseType: state.category } : {}),
        ...((state.category === 'auto' && state.mode && state.transmission) ||
        (state.category === 'moto' && state.motoTarget) ||
        (state.category === 'prives' && state.trailer) ||
        state.category === 'kondicni'
          ? { courseId: courseId() }
          : {}),
        ...(state.branch ? { location: state.branch } : {}),
        ...(state.transmission ? { transmission: state.transmission } : {}),
        stepNumber: steps().indexOf(active) + 1,
        ...extra,
      },
    }),
  );
const courseId = () =>
  state.category === 'auto'
    ? state.mode === 'l17'
      ? 'l17'
      : state.transmission === 'automatic'
        ? 'b-automat'
        : 'b'
    : state.category === 'moto'
      ? state.motoTarget
      : state.category === 'prives'
        ? state.trailer
        : 'kondicni';
const ranks: Record<string, number> = { AM: 0, A1: 1, A2: 2, A: 3 };
function directExtension() {
  const highest = heldLicences()
    .filter((item) => item in ranks)
    .sort((a, b) => ranks[b]! - ranks[a]!)[0];
  return (
    (highest === 'A1' && state.motoTarget === 'a2') ||
    (highest === 'A2' && state.motoTarget === 'a')
  );
}
function steps(): Step[] {
  const base: Step[] = ['category'];
  if (!state.category) return base;
  base.push('branch');
  if (state.category === 'auto') base.push('transmission', 'mode');
  if (state.category === 'kondicni') base.push('transmission', 'drivingBlocks');
  if (state.category === 'prives') base.push('trailer');
  if (state.category === 'moto') {
    base.push('motoTarget', 'licenceStatus');
    if (state.licenceStatus === 'yes') {
      base.push('licences');
      if (directExtension()) base.push('period');
      if (packageNeeded) base.push('package');
    }
  }
  base.push('result');
  return base;
}
const panels: Record<Step, string> = {
  category: '.question:first-of-type',
  branch: '#branch-question',
  transmission: '#transmission-question',
  drivingBlocks: '#driving-blocks-question',
  mode: '#mode-question',
  motoTarget: '#moto-target-question',
  licenceStatus: '#licence-status-question',
  licences: '#licences-question',
  period: '#period-question',
  package: '#package-question',
  trailer: '#trailer-question',
  result: '#pricing-results',
};
const stepNames: Record<Step, string> = {
  category: 'Typ kurzu',
  branch: 'Pobočka',
  transmission: 'Převodovka',
  drivingBlocks: 'Počet jízd',
  mode: 'Varianta',
  motoTarget: 'Skupina',
  licenceStatus: 'Řidičák',
  licences: 'Oprávnění',
  period: 'Délka držení',
  package: 'Balíček',
  trailer: 'Přívěs',
  result: 'Vaše cena',
};
function focusPanel() {
  const panel = $(panels[active]);
  const heading = panel.querySelector<HTMLElement>('legend,h2');
  if (heading) {
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  }
  panel.scrollIntoView({
    behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    block: 'nearest',
  });
}
function goto(step: Step, announce = true) {
  active = step;
  render();
  if (announce && step !== 'result') focusPanel();
}
function advance() {
  const route = steps();
  goto(route[Math.min(route.indexOf(active) + 1, route.length - 1)]!);
}
function resetAfter(step: Step) {
  if (['category', 'branch', 'motoTarget', 'licenceStatus', 'licences', 'period'].includes(step))
    packageNeeded = false;
  const clears: Partial<Record<Step, (keyof Selection)[]>> = {
    category: [
      'branch',
      'transmission',
      'mode',
      'motoTarget',
      'licenceStatus',
      'period',
      'package',
      'trailer',
      'drivingBlocks',
    ],
    branch: [
      'transmission',
      'mode',
      'motoTarget',
      'licenceStatus',
      'period',
      'package',
      'trailer',
      'drivingBlocks',
    ],
    transmission: ['mode', 'drivingBlocks'],
    motoTarget: ['licenceStatus', 'period', 'package'],
    licenceStatus: ['period', 'package'],
    licences: ['period', 'package'],
    period: ['package'],
  };
  for (const key of clears[step] ?? [])
    (state as unknown as Record<string, string | number>)[key] = key === 'drivingBlocks' ? 0 : '';
  if (['category', 'branch', 'motoTarget', 'licenceStatus'].includes(step))
    document.querySelectorAll<HTMLInputElement>('input[name="held-licence"]').forEach((input) => {
      input.checked = false;
    });
  if (['category', 'branch', 'transmission'].includes(step))
    $<HTMLSelectElement>('#pricing-driving-blocks').value = '0';
}
function render() {
  quoteSequence++;
  const route = steps();
  if (!route.includes(active)) active = route.at(-1)!;
  for (const selector of Object.values(panels)) show(selector, selector === panels[active]);
  show('#contact-result', false);
  show('.fees', state.category !== 'kondicni');
  for (const key of [
    'category',
    'branch',
    'transmission',
    'mode',
    'motoTarget',
    'licenceStatus',
    'period',
    'package',
    'trailer',
  ] as const)
    document
      .querySelectorAll<HTMLButtonElement>(
        `.question button[data-${key.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())}]`,
      )
      .forEach((button) =>
        button.setAttribute('aria-pressed', String(button.dataset[key] === state[key])),
      );
  document
    .querySelectorAll<HTMLButtonElement>('#branch-question [data-branch]')
    .forEach((button) => {
      button.disabled =
        ['moto', 'prives'].includes(state.category) && button.dataset.branch !== 'strizkov';
    });
  const automatic = $<HTMLButtonElement>('[data-transmission="automatic"]');
  automatic.disabled = state.branch !== 'strizkov';
  automatic.hidden = state.category === 'kondicni' && state.branch !== 'strizkov';
  $('#transmission-note').textContent =
    state.category === 'kondicni'
      ? state.branch === 'strizkov'
        ? 'Kondiční jízdy na manuálu i automatu.'
        : 'Na této pobočce jezdíme pouze na manuálu.'
      : state.branch === 'strizkov'
        ? 'Manuál i automat jsou dostupné pro klasický kurz i L17.'
        : 'Na této pobočce poskytujeme výcvik pouze na manuálu.';
  const autoPrice = Number(
    $<HTMLButtonElement>(`[data-branch="${state.branch}"]`)?.dataset.bPrice ?? 0,
  );
  document
    .querySelectorAll<HTMLElement>('[data-auto-card-price]')
    .forEach((el) => (el.textContent = autoPrice ? `${money(autoPrice)}*` : ''));
  $<HTMLElement>('[data-mode="standard"] strong').textContent =
    state.transmission === 'automatic' ? 'Kurz skupiny BA' : 'Kurz skupiny B';
  $<HTMLElement>('[data-mode="l17"] strong').textContent =
    state.transmission === 'automatic' ? 'Kurz BA-L17' : 'Kurz L17';
  $<HTMLElement>('#mode-question .picker-intro').textContent =
    state.transmission === 'automatic'
      ? 'Výcvik na automatu má v řidičském průkazu kód 78: platí pro vozidla s automatickou převodovkou. Režim L17 můžete absolvovat také na automatu.'
      : 'S L17 můžete získat řidičák skupiny B už v 17 letech a do osmnácti jezdit se zapsaným mentorem.';
  const progress = $<HTMLElement>('.progress-track');
  progress.setAttribute('aria-valuemax', String(route.length));
  progress.setAttribute('aria-valuenow', String(route.indexOf(active) + 1));
  $('#wizard-progress-fill').style.width = `${((route.indexOf(active) + 1) / route.length) * 100}%`;
  $('#wizard-step-label').textContent =
    `Krok ${route.indexOf(active) + 1} z ${route.length} · ${stepNames[active]}`;
  const path = $('#wizard-path');
  path.replaceChildren();
  route.slice(0, route.indexOf(active)).forEach((step, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = `${index + 1}. ${stepNames[step]}`;
    button.addEventListener('click', () => goto(step));
    path.append(button);
  });
  show('#wizard-back', active !== 'category');
  show('#wizard-licences-next', active === 'licences');
  $<HTMLButtonElement>('#wizard-licences-next').disabled = heldLicences().length === 0;
  if (active === 'result') void requestQuote();
}
async function requestQuote() {
  const sequence = ++quoteSequence;
  show('#pricing-results', false);
  const selection: Record<string, unknown> = {
    course: courseId(),
    branch: state.branch,
    package:
      state.category === 'moto'
        ? state.package ||
          (state.licenceStatus === 'none' || state.motoTarget === 'a1'
            ? 'moto-confidence'
            : 'single')
        : 'single',
  };
  if (['auto', 'kondicni'].includes(state.category)) selection.transmission = state.transmission;
  if (state.category === 'kondicni') selection.drivingBlocks = state.drivingBlocks;
  if (state.category === 'moto') {
    selection.heldLicences = state.licenceStatus === 'yes' ? heldLicences() : [];
    if (directExtension()) selection.holdingPeriod = state.period;
  }
  try {
    const response = await fetch('/api/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(selection),
    });
    const quote = (await response.json()) as Quote;
    if (sequence !== quoteSequence) return;
    if (!quote.ok) {
      if (quote.code === 'PACKAGE_REQUIRED' && quote.allowedPackages) {
        if (quote.allowedPackages.length === 1) {
          state.package = quote.allowedPackages[0]!;
          return requestQuote();
        }
        packageNeeded = true;
        active = 'package';
        render();
        focusPanel();
        return;
      }
      showContact(quote.message);
      return;
    }
    showOffer(selection, quote);
    show('#pricing-results', true);
    focusPanel();
  } catch {
    if (sequence === quoteSequence)
      showContact('Cenu se teď nepodařilo načíst. Ozvěte se nám a výběr spolu projdeme.');
  }
}
function showContact(message: string) {
  $('#contact-message').textContent = message;
  show('#contact-result', true);
}
function showOffer(selection: Record<string, unknown>, result: Extract<Quote, { ok: true }>) {
  const course = catalog.find((item) => item.id === selection.course);
  if (!course) return;
  $('#offer-label').textContent = course.label;
  $('#offer-title').textContent =
    state.category === 'auto'
      ? state.mode === 'l17'
        ? state.transmission === 'automatic'
          ? 'Kurz BA-L17'
          : 'Kurz L17'
        : state.transmission === 'automatic'
          ? 'Kurz skupiny BA'
          : 'Kurz skupiny B'
      : course.name;
  $('#offer-description').textContent = course.description;
  $('#offer-price').textContent = money(result.amount);
  const branchButton = $<HTMLButtonElement>(`#branch-question [data-branch="${state.branch}"]`);
  const branchName =
    branchButton.textContent
      ?.replace(branchButton.querySelector('small')?.textContent ?? '', '')
      .trim() || state.branch;
  $('#offer-summary').textContent =
    `Pobočka: ${branchName}${state.transmission ? ` · Převodovka: ${state.transmission === 'automatic' ? 'automat' : 'manuál'}` : ''}`;
  const refresher = state.category === 'kondicni',
    moto = state.category === 'moto';
  $('#offer-price-note').textContent = refresher
    ? 'Celková cena vybraných kondičních jízd. 800 Kč / 45 minut; jezdíme v 90minutových blocích.'
    : moto
      ? 'Orientační cena kurzu pro sezonu 2027. Přihlašování zatím není otevřené.'
      : 'Cena odpovídá zvolené pobočce a variantě kurzu. * Nezahrnuje poplatky za zkoušku.';
  show('#offer-price-asterisk', !refresher && !moto);
  $('#offer-variant').textContent = refresher
    ? `${state.drivingBlocks} × 90 minut · ${state.drivingBlocks * 2} vyučovacích hodin · ${state.transmission === 'automatic' ? 'automat' : 'manuál'}`
    : moto
      ? result.training === 'supplement'
        ? 'Doplňovací zkouška · 4 hodiny jízd'
        : result.package === 'moto-basic'
          ? 'Moto Základ · 13 hodin jízd'
          : 'Moto Jistota · 20 hodin jízd'
      : state.category === 'auto'
        ? `${state.mode === 'l17' ? 'L17' : 'Klasický kurz'} · ${state.transmission === 'automatic' ? 'automat · kód 78' : 'manuál'}`
        : 'Rozšíření oprávnění';
  const order = $<HTMLButtonElement>('.offer-card [data-order]');
  order.dataset.course = String(selection.course);
  order.dataset.branch = state.branch;
  order.dataset.transmission = state.transmission;
  order.dataset.drivingBlocks = refresher ? String(state.drivingBlocks) : '';
  order.textContent = refresher ? 'Objednat kondiční jízdy ↗' : 'Chci se přihlásit ↗';
  show('.offer-card [data-order]', !moto);
  const link = $<HTMLAnchorElement>('#moto-interest-link');
  if (moto) {
    const params = new URLSearchParams({
      skupina: state.motoTarget,
      zdroj: 'cenik',
      ridicak: state.licenceStatus,
      opravneni: heldLicences().join(','),
      doba: state.period,
      varianta: result.package,
    });
    link.href = `/motorky-2027?${params}`;
  }
  show('#moto-interest-link', moto);
  $<HTMLAnchorElement>('#offer-detail').href = `/kurzy/${course.slug}`;
  const signature = JSON.stringify(selection);
  if (completedSignature !== signature) {
    completedSignature = signature;
    track('course_config_completed');
  }
}
function choose(step: Step, key: keyof Selection, value: string) {
  if (active !== step) return;
  resetAfter(step);
  (state as unknown as Record<string, string | number>)[key] = value;
  if (!funnelStarted) {
    funnelStarted = true;
    track('course_config_start');
  }
  if (step === 'category') track('course_type_selected');
  if (step === 'branch') track('course_location_selected');
  if (step === 'transmission') track('course_transmission_selected');
  advance();
}
for (const [selector, step, key] of [
  ['[data-category]', 'category', 'category'],
  ['[data-branch]', 'branch', 'branch'],
  ['[data-transmission]', 'transmission', 'transmission'],
  ['[data-mode]', 'mode', 'mode'],
  ['[data-moto-target]', 'motoTarget', 'motoTarget'],
  ['[data-licence-status]', 'licenceStatus', 'licenceStatus'],
  ['[data-period]', 'period', 'period'],
  ['[data-package]', 'package', 'package'],
  ['[data-trailer]', 'trailer', 'trailer'],
] as const)
  document
    .querySelectorAll<HTMLButtonElement>(selector)
    .forEach((button) =>
      button.addEventListener('click', () => choose(step, key, button.dataset[key]!)),
    );
$<HTMLSelectElement>('#pricing-driving-blocks').addEventListener('change', (event) => {
  if (active !== 'drivingBlocks') return;
  const count = Number((event.target as HTMLSelectElement).value);
  if (count > 0) {
    state.drivingBlocks = count;
    advance();
  }
});
document.querySelectorAll<HTMLInputElement>('input[name="held-licence"]').forEach((input) =>
  input.addEventListener('change', () => {
    state.period = '';
    state.package = '';
    $<HTMLButtonElement>('#wizard-licences-next').disabled = heldLicences().length === 0;
  }),
);
$('#wizard-licences-next').addEventListener('click', () => {
  if (heldLicences().length) advance();
});
$('#wizard-back').addEventListener('click', () => {
  const route = steps();
  goto(route[Math.max(0, route.indexOf(active) - 1)]!);
});
function restart() {
  Object.assign(state, {
    category: '',
    branch:
      initialBranch && ['strizkov', 'kladno', 'statenice'].includes(initialBranch)
        ? initialBranch
        : '',
    transmission: '',
    mode: '',
    motoTarget: '',
    licenceStatus: '',
    period: '',
    package: '',
    trailer: '',
    drivingBlocks: 0,
  });
  document
    .querySelectorAll<HTMLInputElement>('input[name="held-licence"]')
    .forEach((input) => (input.checked = false));
  $<HTMLSelectElement>('#pricing-driving-blocks').value = '0';
  funnelStarted = false;
  packageNeeded = false;
  completedSignature = '';
  goto('category');
}
$('#wizard-restart').addEventListener('click', restart);
$('.reset-selection').addEventListener('click', restart);
$<HTMLButtonElement>('.offer-card [data-order]').addEventListener('click', () =>
  track('course_registration_click'),
);
render();

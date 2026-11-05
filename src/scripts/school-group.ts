import { getRecaptchaToken } from './recaptcha';
import { readAdAttribution } from './ad-attribution';

const form = document.querySelector<HTMLFormElement>('#manna-form')!;
if (form) {
  const membersNode = document.querySelector<HTMLElement>('#manna-members')!;
  const recap = document.querySelector<HTMLElement>('#manna-recap')!;
  const error = document.querySelector<HTMLElement>('#manna-error')!;
  const next = document.querySelector<HTMLButtonElement>('#manna-next')!;
  const back = document.querySelector<HTMLButtonElement>('#manna-back')!;
  const submit = document.querySelector<HTMLButtonElement>('#manna-submit')!;
  let step = 1;
  let started = false;
  let submissionKey = crypto.randomUUID();
  const track = (name: string, details: Record<string, string | number> = {}) =>
    window.dispatchEvent(
      new CustomEvent('bubu:tracking', {
        detail: { name, partnerSchool: 'gymnazium_manna', ...details },
      }),
    );
  let landingViewSent = false;
  const trackLandingView = () => {
    if (landingViewSent) return;
    try {
      const cookie = document.cookie
        .split('; ')
        .find((part) => part.startsWith('bubu_cookie_consent='));
      const consent =
        cookie && JSON.parse(decodeURIComponent(cookie.slice('bubu_cookie_consent='.length + 1)));
      if (consent?.version !== 1 || consent.analytics !== true) return;
      track('school_landing_view');
      landingViewSent = true;
    } catch {
      /* Analytics must never interrupt the form. */
    }
  };
  window.addEventListener('load', trackLandingView, { once: true });
  document.addEventListener('bubu:cookie-consent-updated', trackLandingView);

  const course = () =>
    form.querySelector<HTMLInputElement>('input[name=courseType]:checked')?.value === 'isp'
      ? 'isp'
      : 'school';
  const size = () => (course() === 'school' ? 10 : 5);
  const money = () => (course() === 'school' ? '30 500 Kč' : '25 900 Kč');
  function drawMembers() {
    const previous = readMembers();
    membersNode.replaceChildren();
    for (let index = 0; index < size(); index++) {
      const section = document.createElement('section');
      section.className = 'manna-member';
      const heading = document.createElement('h4');
      heading.textContent =
        index === 0 ? 'Ty · koordinátor skupiny' : `${index + 1}. spolužák / spolužačka`;
      const fields = document.createElement('div');
      fields.className = 'manna-fields';
      for (const [name, label, type] of [
        ['firstName', 'Jméno', 'text'],
        ['lastName', 'Příjmení', 'text'],
        ['email', 'E-mail', 'email'],
        ['phone', 'Telefon', 'tel'],
      ] as const) {
        const wrapper = document.createElement('label');
        wrapper.textContent = label;
        const input = document.createElement('input');
        input.name = `${name}-${index}`;
        input.type = type;
        input.required = true;
        input.maxLength = name === 'email' ? 254 : name === 'phone' ? 20 : 80;
        input.autocomplete =
          index === 0
            ? (
                {
                  firstName: 'given-name',
                  lastName: 'family-name',
                  email: 'email',
                  phone: 'tel',
                } as const
              )[name]
            : 'off';
        input.value = previous[index]?.[name as keyof (typeof previous)[number]] ?? '';
        wrapper.append(input);
        fields.append(wrapper);
      }
      section.append(heading, fields);
      membersNode.append(section);
    }
  }
  function readMembers() {
    return Array.from(
      { length: membersNode.querySelectorAll('.manna-member').length },
      (_, index) => ({
        firstName: (form.elements.namedItem(`firstName-${index}`) as HTMLInputElement).value.trim(),
        lastName: (form.elements.namedItem(`lastName-${index}`) as HTMLInputElement).value.trim(),
        email: (form.elements.namedItem(`email-${index}`) as HTMLInputElement).value
          .trim()
          .toLowerCase(),
        phone: (form.elements.namedItem(`phone-${index}`) as HTMLInputElement).value.trim(),
      }),
    );
  }
  function showStep(value: number) {
    step = value;
    form.querySelectorAll<HTMLElement>('[data-group-step]').forEach((node) => {
      node.hidden = Number(node.dataset.groupStep) !== step;
    });
    form
      .querySelectorAll<HTMLElement>('[data-progress]')
      .forEach((node) => node.classList.toggle('active', Number(node.dataset.progress) === step));
    back.hidden = step === 1;
    next.hidden = step === 3;
    submit.hidden = step !== 3;
    error.textContent = '';
    if (value > 1) form.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
  function validateMembers() {
    const inputs = membersNode.querySelectorAll<HTMLInputElement>('input');
    for (const input of inputs) {
      if (!input.checkValidity()) {
        input.reportValidity();
        return false;
      }
    }
    const emails = readMembers().map((member) => member.email);
    if (new Set(emails).size !== emails.length) {
      error.textContent = 'Každý člen musí mít vlastní e-mailovou adresu.';
      return false;
    }
    if (!document.querySelector<HTMLInputElement>('#manna-privacy')?.checked) {
      error.textContent = 'Potvrď prosím podmínky odeslání pozvánek.';
      return false;
    }
    return true;
  }
  function drawRecap() {
    recap.replaceChildren();
    const heading = document.createElement('p');
    heading.textContent = `${course() === 'school' ? 'Školní kurz' : 'Kurz ISP'} · ${money()} za osobu · ${size()} členů`;
    recap.append(heading);
    for (const member of readMembers()) {
      const row = document.createElement('div');
      row.className = 'manna-recap-row';
      row.textContent = `${member.firstName} ${member.lastName} · ${member.email} · ${member.phone}`;
      recap.append(row);
    }
  }
  form.addEventListener('input', () => {
    if (!started) {
      track('group_form_start');
      started = true;
    }
  });
  form.addEventListener('change', (event) => {
    if (event.target instanceof HTMLInputElement && event.target.name === 'courseType')
      drawMembers();
  });
  document.querySelectorAll<HTMLAnchorElement>('[data-choose-course]').forEach((link) => {
    link.addEventListener('click', () => {
      const radio = form.querySelector<HTMLInputElement>(
        `input[value=${link.dataset.chooseCourse}]`,
      );
      if (radio) {
        radio.checked = true;
        drawMembers();
      }
    });
  });
  next.addEventListener('click', () => {
    if (step === 2 && !validateMembers()) return;
    if (step === 2) drawRecap();
    showStep(step + 1);
  });
  back.addEventListener('click', () => showStep(step - 1));
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!validateMembers()) {
      showStep(2);
      error.textContent = 'Zkontroluj prosím kontakty a souhlas.';
      return;
    }
    submit.disabled = true;
    error.textContent = 'Odesíláme pozvánky…';
    try {
      const captchaToken = document.body.dataset.recaptchaSiteKey
        ? await getRecaptchaToken('order')
        : 'preview-order-submission';
      const response = await fetch('/api/school-groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submissionKey,
          courseType: course(),
          members: readMembers(),
          recaptchaToken: captchaToken,
          ...(readAdAttribution() ? { attribution: readAdAttribution() } : {}),
        }),
      });
      const result = (await response.json()) as { ok: boolean; code?: string; message?: string };
      if (result.code === 'INVALID_REQUEST') {
        showStep(2);
        throw new Error(result.message ?? 'Zkontroluj kontaktní údaje všech členů skupiny.');
      }
      if (result.code === 'CAPTCHA_FAILED')
        throw new Error('Ověření reCAPTCHA se nezdařilo. Zkus formulář odeslat znovu.');
      if (result.code === 'RATE_LIMITED')
        throw new Error('Příliš mnoho pokusů. Zkuste to za chvíli.');
      if (!response.ok || !result.ok)
        throw new Error('Skupinu se nepodařilo uložit. Zkuste to prosím znovu.');
      track('group_registration_submit', { courseType: course() });
      submissionKey = crypto.randomUUID();
      form.innerHTML =
        '<h3>Parta je zapsaná! 👻</h3><p>Spolužákům posíláme individuální pozvánky. Každý si po potvrzení vybere svůj termín zápisu.</p>';
    } catch (cause) {
      error.textContent = cause instanceof Error ? cause.message : 'Zkuste to prosím znovu.';
      submit.disabled = false;
    }
  });
  drawMembers();
  showStep(1);
}

export {};
const forms = document.querySelectorAll<HTMLFormElement>('[data-general-contact]');
for (const form of forms) {
  const status = form.querySelector<HTMLElement>('[data-contact-status]')!;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    status.textContent = '';
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    const originalText = button.textContent ?? 'Odeslat dotaz';
    button.disabled = true;
    button.textContent = 'Odesíláme…';
    const data = new FormData(form);

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: String(data.get('name') ?? ''),
          email: String(data.get('email') ?? ''),
          phone: String(data.get('phone') ?? ''),
          subject: String(data.get('subject') ?? ''),
          message: String(data.get('message') ?? ''),
          website: String(data.get('website') ?? ''),
        }),
      });
      const result = await response.json().catch(() => ({ ok: false }));
      if (response.ok && result.ok) {
        form.reset();
        status.textContent = 'Děkujeme, dotaz jsme přijali. Ozveme se vám co nejdřív.';
      } else {
        status.textContent =
          result.code === 'CONTACT_NOT_CONFIGURED'
            ? 'Formulář je připravený, ale server ještě nemá nastavené odesílání e-mailů.'
            : 'Dotaz se nepodařilo odeslat. Zkuste prosím zavolat na nejbližší pobočku.';
      }
    } catch {
      status.textContent =
        'Dotaz se nepodařilo odeslat. Zkuste prosím zavolat na nejbližší pobočku.';
    } finally {
      button.disabled = false;
      button.textContent = originalText;
    }
  });
}

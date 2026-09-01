const forms = document.querySelectorAll<HTMLFormElement>('[data-branch-contact]');
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
    button.disabled = true;
    button.textContent = 'Odesíláme…';
    const data = new FormData(form);
    try {
      const response = await fetch('/api/branch-contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branch: form.dataset.branch,
          name: String(data.get('name') ?? ''),
          email: String(data.get('email') ?? ''),
          phone: String(data.get('phone') ?? ''),
          message: String(data.get('message') ?? ''),
          website: String(data.get('website') ?? ''),
        }),
      });
      const result = await response.json().catch(() => ({ ok: false }));
      if (response.ok && result.ok) {
        form.reset();
        status.textContent = 'Děkujeme, dotaz jsme přijali. Ozveme se vám z pobočky.';
      } else {
        status.textContent =
          result.code === 'CONTACT_NOT_CONFIGURED'
            ? 'Formulář je připravený, ale server ještě nemá nastavené odesílání e-mailů.'
            : 'Dotaz se nepodařilo odeslat. Zkuste prosím zavolat na pobočku.';
      }
    } catch {
      status.textContent = 'Dotaz se nepodařilo odeslat. Zkuste prosím zavolat na pobočku.';
    } finally {
      button.disabled = false;
      button.textContent = 'Odeslat dotaz';
    }
  });
}

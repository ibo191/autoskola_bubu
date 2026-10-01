// Progressive enhancement for the private dashboard. Every link and form still
// works as a regular request when JavaScript is unavailable.
const dashboardSelector = '.admin-section[data-admin-enhance="true"]';
let pending = false;
let statusTimer: number | undefined;

function dashboard() {
  return document.querySelector<HTMLElement>(dashboardSelector);
}

function statusElement() {
  let element = document.querySelector<HTMLElement>('#admin-ajax-status');
  if (!element) {
    element = document.createElement('div');
    element.id = 'admin-ajax-status';
    element.className = 'admin-ajax-status';
    element.setAttribute('role', 'status');
    element.setAttribute('aria-live', 'polite');
    element.hidden = true;
    document.body.append(element);
  }
  return element;
}

function showStatus(message: string, error = false, duration = 0) {
  const element = statusElement();
  window.clearTimeout(statusTimer);
  element.textContent = message;
  element.dataset.error = String(error);
  element.setAttribute('role', error ? 'alert' : 'status');
  element.hidden = false;
  if (duration) statusTimer = window.setTimeout(() => (element.hidden = true), duration);
}

function panelPosition(source?: Element | null) {
  const panel = source?.closest<HTMLElement>('[data-admin-panel]');
  return panel?.dataset.adminPanel
    ? { key: panel.dataset.adminPanel, top: panel.getBoundingClientRect().top }
    : null;
}

function resultMessage(url: URL, next: HTMLElement, wasPost: boolean) {
  const result = url.searchParams.get('actionResult');
  if (result === 'email_failed')
    return {
      text: 'Změna byla uložená, ale e-mail se nepodařilo zařadit k odeslání.',
      error: true,
    };
  if (result === 'attended')
    return { text: 'Nástup potvrzen. E-mail byl zařazen k odeslání.', error: false };
  if (result === 'no_show')
    return { text: 'Nedostavení zaznamenáno. E-mail byl zařazen k odeslání.', error: false };
  if (result === 'cancelled')
    return { text: 'Objednávka zrušena. E-mail byl zařazen k odeslání.', error: false };
  const scheduleResult = url.searchParams.get('scheduleResult');
  if (scheduleResult) {
    const notice = next.querySelector<HTMLElement>('[data-schedule-result]');
    return {
      text: notice?.textContent?.trim() || 'Správa termínů byla aktualizována.',
      error: Boolean(notice?.classList.contains('schedule-error')),
    };
  }
  const reportResult = url.searchParams.get('reportResult');
  if (reportResult)
    return {
      text:
        reportResult === 'sent'
          ? 'Report byl odeslán nebo již dříve doručen.'
          : 'Report se nepodařilo odeslat.',
      error: reportResult !== 'sent',
    };
  return { text: wasPost ? 'Změna byla uložena.' : 'Přehled aktualizován.', error: false };
}

async function updateDashboard(
  url: URL,
  options: {
    formData?: FormData;
    source?: Element | null;
    historyMode: 'push' | 'replace' | 'none';
  },
) {
  const current = dashboard();
  if (!current || pending) return;
  pending = true;
  current.setAttribute('aria-busy', 'true');
  const anchor = panelPosition(options.source);
  const originalScroll = window.scrollY;
  const button =
    options.source instanceof HTMLFormElement
      ? options.source.querySelector<HTMLButtonElement>('button[type="submit"]')
      : null;
  const previousButtonText = button?.textContent ?? '';
  if (button) {
    button.disabled = true;
    button.textContent = options.formData ? 'Ukládám…' : 'Načítám…';
  }
  showStatus(options.formData ? 'Ukládám změnu…' : 'Načítám přehled…');
  let actionCompleted = false;
  try {
    let response = await fetch(url, {
      method: options.formData ? 'POST' : 'GET',
      body: options.formData,
      credentials: 'same-origin',
      cache: 'no-store',
      redirect: 'follow',
      headers: {
        Accept: options.formData ? 'application/json' : 'text/html',
        ...(options.formData ? { 'X-Admin-Async': '1' } : {}),
      },
    });
    if (response.status === 401) {
      window.location.assign('/sprava');
      return;
    }
    if (!response.ok) {
      const detail = response.headers.get('content-type')?.includes('text/plain')
        ? (await response.text()).trim().slice(0, 240)
        : '';
      throw new Error(detail || 'Požadavek se nepodařilo dokončit.');
    }
    if (options.formData && response.headers.get('content-type')?.includes('application/json')) {
      const result: unknown = await response.json();
      actionCompleted = true;
      const destination =
        result && typeof result === 'object' && 'redirectTo' in result
          ? new URL(String(result.redirectTo), window.location.origin)
          : null;
      if (
        !destination ||
        destination.origin !== window.location.origin ||
        destination.pathname !== '/sprava'
      )
        throw new Error('Změna byla uložena, ale přehled se nepodařilo načíst. Obnovte stránku.');
      response = await fetch(destination, {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'text/html' },
      });
      if (!response.ok)
        throw new Error('Změna byla uložena, ale přehled se nepodařilo načíst. Obnovte stránku.');
    }
    const finalUrl = new URL(response.url);
    if (finalUrl.origin !== window.location.origin || finalUrl.pathname !== '/sprava')
      throw new Error('Nepodařilo se načíst přehled.');
    const page = new DOMParser().parseFromString(await response.text(), 'text/html');
    const next = page.querySelector<HTMLElement>(dashboardSelector);
    if (!next) {
      window.location.assign(finalUrl.href);
      return;
    }
    const message = resultMessage(finalUrl, next, Boolean(options.formData));
    current.replaceWith(next);
    if (options.historyMode !== 'none') {
      window.history[options.historyMode === 'push' ? 'pushState' : 'replaceState'](
        {},
        '',
        finalUrl,
      );
    }
    const updatedPanel =
      anchor && next.querySelector<HTMLElement>(`[data-admin-panel="${anchor.key}"]`);
    if (updatedPanel && anchor)
      window.scrollBy(0, updatedPanel.getBoundingClientRect().top - anchor.top);
    else window.scrollTo(0, originalScroll);
    showStatus(message.text, message.error, message.error ? 8000 : 4000);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Akci se nepodařilo dokončit.';
    showStatus(
      actionCompleted && !message.includes('Změna byla uložena')
        ? `Změna byla uložena. ${message}`
        : message,
      true,
      8000,
    );
  } finally {
    pending = false;
    dashboard()?.removeAttribute('aria-busy');
    if (button?.isConnected) {
      button.disabled = false;
      button.textContent = previousButtonText;
    }
  }
}

function confirmAction(form: HTMLFormElement) {
  if (form.matches('[data-cancel-order]'))
    return window.confirm(
      'Opravdu zrušit objednávku? Zmizí z běžného přehledu a termín se uvolní. Zákazníkovi odejde neutrální potvrzení o zrušení.',
    );
  if (form.matches('[data-no-show-order]'))
    return window.confirm(
      'Potvrdit, že zákazník nedorazil na zápis? Odešleme mu e-mail s možností zvolit nový termín.',
    );
  if (form.matches('[data-schedule-confirm]'))
    return window.confirm(form.dataset.scheduleConfirm ?? 'Potvrdit změnu termínu?');
  return true;
}

document.addEventListener('submit', (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || !form.closest(dashboardSelector)) return;
  if (form.querySelector('[name="intent"][value="logout"]')) return;
  const url = new URL(form.action);
  if (
    url.origin !== window.location.origin ||
    (url.pathname !== '/sprava' && !url.pathname.startsWith('/sprava/'))
  )
    return;
  event.preventDefault();
  if (pending || !confirmAction(form)) return;
  const data = new FormData(form);
  if (form.method.toLowerCase() === 'get') {
    const params = new URLSearchParams();
    data.forEach((value, key) => params.append(key, String(value)));
    url.search = params.toString();
    void updateDashboard(url, { source: form, historyMode: 'push' });
  } else {
    void updateDashboard(url, { formData: data, source: form, historyMode: 'replace' });
  }
});

document.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const link = target.closest<HTMLAnchorElement>('a[href]');
  if (!link?.closest(dashboardSelector) || link.hasAttribute('download') || event.defaultPrevented)
    return;
  if (
    event instanceof MouseEvent &&
    (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)
  )
    return;
  const url = new URL(link.href);
  if (
    url.origin !== window.location.origin ||
    url.pathname !== '/sprava' ||
    (link.target && link.target !== '_self')
  )
    return;
  event.preventDefault();
  if (!pending) void updateDashboard(url, { source: link, historyMode: 'push' });
});

window.addEventListener('popstate', () => {
  if (!dashboard()) return;
  if (pending) {
    window.location.reload();
    return;
  }
  void updateDashboard(new URL(window.location.href), { historyMode: 'none' });
});

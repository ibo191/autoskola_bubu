type Slot = { id: string; branch: string; startsAt: string; endsAt: string; remaining: number };
import { getRecaptchaToken } from './recaptcha';
import { firstBookingMonth } from '../lib/booking/enrollment-window';
const root = document.querySelector<HTMLElement>('[data-manage-order]');
if (root) {
  const code = root.dataset.manageOrder!;
  const branch = root.dataset.branch!;
  const title = document.querySelector<HTMLElement>('#manage-title')!;
  const days = document.querySelector<HTMLElement>('#manage-days')!;
  const slotsEl = document.querySelector<HTMLElement>('#manage-slots')!;
  const message = document.querySelector<HTMLElement>('#manage-message')!;
  const selectedLabel = document.querySelector<HTMLElement>('#manage-selected-slot');
  const minimumMonth = () => firstBookingMonth(branch);
  let cursor = minimumMonth();
  let loaded: Slot[] = [];
  let selected = '';
  let selectedSlot = '';

  const key = (date: Date) =>
    `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}`;
  const time = (start: string, end: string) =>
    `${new Intl.DateTimeFormat('cs-CZ', { hour: '2-digit', minute: '2-digit' }).format(new Date(start))}–${new Intl.DateTimeFormat('cs-CZ', { hour: '2-digit', minute: '2-digit' }).format(new Date(end))}`;

  function renderSlots(date: string) {
    slotsEl.replaceChildren();
    const slots = loaded.filter((slot) => key(new Date(slot.startsAt)) === date);
    selectedSlot = '';
    if (selectedLabel) selectedLabel.textContent = 'Vyberte časový slot pro zvolený den.';
    if (!slots.length) {
      slotsEl.innerHTML = '<p>Pro tento den už nejsou volné časy.</p>';
      return;
    }
    for (const slot of slots) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'slot-option';
      button.textContent = time(slot.startsAt, slot.endsAt);
      button.setAttribute('aria-pressed', String(slot.id === selectedSlot));
      button.addEventListener('click', async () => {
        selectedSlot = slot.id;
        slotsEl
          .querySelectorAll('.slot-option')
          .forEach((item) => item.setAttribute('aria-pressed', 'false'));
        button.setAttribute('aria-pressed', 'true');
        if (selectedLabel)
          selectedLabel.textContent = `Vybraný nový termín: ${time(slot.startsAt, slot.endsAt)}.`;
        button.disabled = true;
        message.textContent = 'Ukládáme nový termín…';
        try {
          const recaptchaToken = await getRecaptchaToken('reservation');
          const response = await fetch(`/api/orders/${encodeURIComponent(code)}/reschedule`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ slotId: slot.id, recaptchaToken }),
          });
          const result = await response.json().catch(() => ({ ok: false }));
          if (response.ok && result.ok) {
            window.location.href = `/dekujeme?kod=${encodeURIComponent(code)}`;
            return;
          }
          message.textContent =
            result.code === 'CAPTCHA_FAILED'
              ? 'Odeslání se nepodařilo. Zkuste to prosím znovu.'
              : 'Termín se nepodařilo změnit. Zkuste prosím jiný čas.';
        } catch {
          message.textContent = 'Odeslání se nepodařilo. Zkuste to prosím znovu.';
        }
        button.disabled = false;
      });
      slotsEl.append(button);
    }
  }

  function renderCalendar() {
    const available = new Set(loaded.map((slot) => key(new Date(slot.startsAt))));
    days.replaceChildren();
    title.textContent = new Intl.DateTimeFormat('cs-CZ', { month: 'long', year: 'numeric' }).format(
      cursor,
    );
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7;
    const count = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    for (let i = 0; i < offset; i += 1) days.append(document.createElement('span'));
    for (let day = 1; day <= count; day += 1) {
      const date = new Date(cursor.getFullYear(), cursor.getMonth(), day);
      const dateKey = key(date);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'calendar-day';
      button.textContent = String(day);
      button.disabled = !available.has(dateKey);
      if (available.has(dateKey)) button.classList.add('available');
      if (selected === dateKey) button.classList.add('selected');
      button.addEventListener('click', () => {
        selected = dateKey;
        renderCalendar();
        renderSlots(dateKey);
      });
      days.append(button);
    }
    if (!selected) slotsEl.innerHTML = '<p>Vyberte zvýrazněný den.</p>';
  }

  async function load() {
    selected = '';
    selectedSlot = '';
    loaded = [];
    title.textContent = 'Načítáme termíny…';
    days.replaceChildren();
    slotsEl.innerHTML = '<p>Načítáme volné termíny…</p>';
    const from = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const to = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    const response = await fetch(
      `/api/slots?branch=${encodeURIComponent(branch)}&from=${key(from)}&to=${key(to)}`,
    );
    const result = await response.json().catch(() => ({ ok: false }));
    loaded = result.ok ? (result.slots ?? []) : [];
    if (!loaded.length)
      slotsEl.innerHTML = `<p>${result.message ?? 'Pro tuto pobočku nejsou vypsané termíny.'}</p>`;
    renderCalendar();
  }

  document.querySelector('#manage-prev')!.addEventListener('click', () => {
    const previous = new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1);
    if (previous < minimumMonth()) return;
    cursor = previous;
    void load();
  });
  document.querySelector('#manage-next')!.addEventListener('click', () => {
    cursor.setMonth(cursor.getMonth() + 1);
    void load();
  });
  document.querySelector('#cancel-appointment')!.addEventListener('click', async () => {
    if (!confirm('Opravdu chcete zrušit termín zápisu? Objednávka zůstane v systému.')) return;
    message.textContent = 'Rušíme termín…';
    try {
      const recaptchaToken = await getRecaptchaToken('reservation');
      const response = await fetch(`/api/orders/${encodeURIComponent(code)}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recaptchaToken }),
      });
      const result = await response.json().catch(() => ({ ok: false }));
      message.textContent =
        response.ok && result.ok
          ? 'Termín zápisu byl zrušen.'
          : result.code === 'CAPTCHA_FAILED'
            ? 'Odeslání se nepodařilo. Zkuste to prosím znovu.'
            : 'Termín se nepodařilo zrušit.';
    } catch {
      message.textContent = 'Odeslání se nepodařilo. Zkuste to prosím znovu.';
    }
  });
  void load();
}

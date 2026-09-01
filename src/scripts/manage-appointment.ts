type Slot = { id: string; branch: string; startsAt: string; endsAt: string; remaining: number };
const root = document.querySelector<HTMLElement>('[data-manage-order]');
if (root) {
  const code = root.dataset.manageOrder!;
  const branch = root.dataset.branch!;
  const title = document.querySelector<HTMLElement>('#manage-title')!;
  const days = document.querySelector<HTMLElement>('#manage-days')!;
  const slotsEl = document.querySelector<HTMLElement>('#manage-slots')!;
  const message = document.querySelector<HTMLElement>('#manage-message')!;
  let cursor = new Date();
  cursor.setDate(1);
  let loaded: Slot[] = [];
  let selected = '';

  const key = (date: Date) =>
    `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}`;
  const time = (start: string, end: string) =>
    `${new Intl.DateTimeFormat('cs-CZ', { hour: '2-digit', minute: '2-digit' }).format(new Date(start))}–${new Intl.DateTimeFormat('cs-CZ', { hour: '2-digit', minute: '2-digit' }).format(new Date(end))}`;

  function renderSlots(date: string) {
    slotsEl.replaceChildren();
    const slots = loaded.filter((slot) => key(new Date(slot.startsAt)) === date);
    if (!slots.length) {
      slotsEl.innerHTML = '<p>Pro tento den už nejsou volné časy.</p>';
      return;
    }
    for (const slot of slots) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'slot-option';
      button.textContent = time(slot.startsAt, slot.endsAt);
      button.addEventListener('click', async () => {
        button.disabled = true;
        message.textContent = 'Ukládáme nový termín…';
        const response = await fetch(`/api/orders/${encodeURIComponent(code)}/reschedule`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slotId: slot.id }),
        });
        const result = await response.json().catch(() => ({ ok: false }));
        if (response.ok && result.ok) {
          window.location.href = `/dekujeme?kod=${encodeURIComponent(code)}`;
          return;
        }
        message.textContent = 'Termín se nepodařilo změnit. Zkuste prosím jiný čas.';
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
    cursor.setMonth(cursor.getMonth() - 1);
    void load();
  });
  document.querySelector('#manage-next')!.addEventListener('click', () => {
    cursor.setMonth(cursor.getMonth() + 1);
    void load();
  });
  document.querySelector('#cancel-appointment')!.addEventListener('click', async () => {
    if (!confirm('Opravdu chcete zrušit termín zápisu? Objednávka zůstane v systému.')) return;
    message.textContent = 'Rušíme termín…';
    const response = await fetch(`/api/orders/${encodeURIComponent(code)}/cancel`, {
      method: 'POST',
    });
    const result = await response.json().catch(() => ({ ok: false }));
    message.textContent =
      response.ok && result.ok ? 'Termín zápisu byl zrušen.' : 'Termín se nepodařilo zrušit.';
  });
  void load();
}

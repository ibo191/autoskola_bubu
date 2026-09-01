import { money } from './format';
import { branches, courses } from './catalog';
import type { PublicOrderOverview } from './booking/repository';

export function formatDateTime(value?: string) {
  if (!value) return 'Termín zatím není vybraný';
  return new Intl.DateTimeFormat('cs-CZ', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Prague',
  }).format(new Date(value));
}

export function courseLabel(id: string) {
  const course = courses.find((item) => item.id === id);
  return course ? `${course.label} – ${course.name}` : id;
}

export function branchLabel(id: string) {
  return branches.find((item) => item.id === id)?.name ?? id;
}

export function orderTotal(order: PublicOrderOverview) {
  return money(order.price.amount);
}

export function orderSummaryText(order: PublicOrderOverview) {
  const appointment = order.appointment
    ? formatDateTime(order.appointment.startsAt)
    : 'bez termínu';
  return `${courseLabel(order.selection.course)} · ${branchLabel(order.selection.branch)} · ${orderTotal(order)} · ${appointment}`;
}

export const cancellationReasons = {
  scheduling_conflict: 'Termín mi časově nevyhovuje',
  illness: 'Nemoc nebo zdravotní důvody',
  postpone_course: 'Chci kurz zahájit později',
  other: 'Jiný důvod',
  no_longer_interested: 'Změnil/a jsem názor, už nechci dělat kurz u Autoškoly BuBu',
} as const;

export type CancellationReason = keyof typeof cancellationReasons;
export const cancellationReasonCodes = Object.keys(cancellationReasons) as CancellationReason[];

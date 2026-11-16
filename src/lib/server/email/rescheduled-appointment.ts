import { waitUntil } from '@vercel/functions';
import { publicAppOrigin } from '../../config';
import { requireLiveRepository } from '../live-order';
import { createOrderEmailOutbox } from './order-outbox';
import { appointmentChangedEmail } from './templates';

export async function queueRescheduledAppointmentEmail(
  repository: ReturnType<typeof requireLiveRepository>,
  publicCode: string,
  result: { appointmentId: string; startsAt: string; endsAt: string; revision?: number },
) {
  try {
    const order = await repository.getPublicOrder(publicCode);
    if (!order) throw new Error('Order was not found after rescheduling');
    const manageUrl = new URL('/spravovat-termin', publicAppOrigin(process.env));
    manageUrl.searchParams.set('kod', order.publicCode);
    await createOrderEmailOutbox(process.env, (task) => waitUntil(task)).send(
      appointmentChangedEmail({
        order: {
          ...order,
          appointment: {
            id: result.appointmentId,
            branch: order.selection.branch,
            status: 'rescheduled',
            startsAt: result.startsAt,
            endsAt: result.endsAt,
          },
        },
        manageUrl: manageUrl.href,
        kind: 'rescheduled',
        revision: result.revision,
      }),
    );
    return true;
  } catch (error) {
    console.warn('appointment_rescheduled_email_queue_failed', {
      error: error instanceof Error ? error.message : 'unknown',
    });
    return false;
  }
}

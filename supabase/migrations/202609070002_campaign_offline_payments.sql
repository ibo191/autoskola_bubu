-- Christmas vouchers are not paid online. Allow an explicit offline payment status.

alter table if exists public.campaign_requests
  drop constraint if exists campaign_requests_payment_status_check;

alter table if exists public.campaign_requests
  add constraint campaign_requests_payment_status_check
  check (
    payment_status in (
      'not_required',
      'pending_offline_payment',
      'pending_future_payment',
      'pending',
      'paid',
      'cancelled',
      'failed'
    )
  );

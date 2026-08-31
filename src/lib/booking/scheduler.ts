import type { EmailAdapter, JobRepository } from '../integrations/contracts';
export async function runReminders(jobs: JobRepository, email: EmailAdapter, now: Date) {
  const due = await jobs.claimDue(now, 50);
  for (const job of due) {
    try {
      await email.send(job.message);
      await jobs.complete(job.id);
    } catch {
      await jobs.retry(job.id);
    }
  }
  return due.length;
}

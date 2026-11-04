import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { contactSchema } from './validation/contact';
import { createTransactionalEmailAdapter } from './server/email';
import type { EmailMessage } from './integrations/contracts';

export const SCHOOL_CODE = 'gymnazium_manna';
export const schoolPrices = { school: 30500, isp: 25900 } as const;
export const schoolSizes = { school: 10, isp: 5 } as const;
const memberSchema = contactSchema.omit({ website: true });
export const groupSchema = z
  .object({
    submissionKey: z.uuid(),
    courseType: z.enum(['school', 'isp']),
    members: z.array(memberSchema).min(5).max(10),
    recaptchaToken: z.string().min(1).max(4096),
    attribution: z
      .object({
        gclid: z.string().max(256).optional(),
        gbraid: z.string().max(256).optional(),
        wbraid: z.string().max(256).optional(),
        utm: z
          .object({
            utm_source: z.string().max(256).optional(),
            utm_medium: z.string().max(256).optional(),
            utm_campaign: z.string().max(256).optional(),
            utm_id: z.string().max(256).optional(),
            utm_term: z.string().max(256).optional(),
            utm_content: z.string().max(256).optional(),
          })
          .strict(),
        landingPage: z.url().max(2048),
        firstClickAt: z.iso.datetime(),
        consentAt: z.iso.datetime(),
      })
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (value.members.length !== schoolSizes[value.courseType])
      ctx.addIssue({ code: 'custom', path: ['members'], message: 'Nesprávný počet členů.' });
    const emails = value.members.map((member) => member.email);
    if (new Set(emails).size !== emails.length)
      ctx.addIssue({ code: 'custom', path: ['members'], message: 'Duplicitní e-mail.' });
  });

type Env = Record<string, string | undefined>;
type Group = {
  id: string;
  course_type: 'school' | 'isp';
  status: string;
  coordinator_id: string;
  created_at: string;
};
export type SchoolMember = {
  id: string;
  group_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  confirmation_status: 'invited' | 'confirmed' | 'declined';
  invitation_sent_at: string | null;
  reminder_sent_at: string | null;
  existing_order_id: string | null;
  created_at: string;
};

function config(env: Env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY)
    throw new Error('School groups are not configured');
  return { base: new URL('/rest/v1/', env.SUPABASE_URL).href, key: env.SUPABASE_SERVICE_ROLE_KEY };
}

async function db(env: Env, path: string, init: RequestInit = {}) {
  const { base, key } = config(env);
  const response = await fetch(base + path, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(10000),
    redirect: 'error',
  });
  if (!response.ok) throw new Error(`School group database operation failed: ${response.status}`);
  return response.json().catch(() => null);
}

export async function createGroup(
  env: Env,
  input: z.infer<typeof groupSchema>,
  attributionAllowed = false,
) {
  const created = (await db(env, 'rpc/bubu_create_school_group', {
    method: 'POST',
    body: JSON.stringify({
      p_submission_key: input.submissionKey,
      p_course_type: input.courseType,
      p_members: input.members,
      p_attribution: attributionAllowed ? (input.attribution ?? null) : null,
    }),
  })) as { id: string; created: boolean };
  if (!created.created) {
    const group = await getGroup(env, created.id);
    const members = await groupMembers(env, created.id);
    if (
      group?.course_type !== input.courseType ||
      members.length !== input.members.length ||
      members.some((member) => {
        const expected = input.members.find((item) => item.email === member.email);
        return (
          !expected ||
          member.first_name !== expected.firstName ||
          member.last_name !== expected.lastName ||
          member.phone !== expected.phone
        );
      })
    )
      throw new Error('GROUP_IDEMPOTENCY_CONFLICT');
  }
  return created;
}

export async function getGroup(env: Env, id: string) {
  const rows = (await db(
    env,
    `school_groups?id=eq.${encodeURIComponent(id)}&select=id,course_type,status,coordinator_id,created_at&limit=1`,
  )) as Group[];
  return rows[0] ?? null;
}

export async function getMember(env: Env, id: string) {
  const rows = (await db(
    env,
    `school_group_members?id=eq.${encodeURIComponent(id)}&select=*&limit=1`,
  )) as SchoolMember[];
  return rows[0] ?? null;
}

export async function groupMembers(env: Env, groupId: string) {
  return (await db(
    env,
    `school_group_members?group_id=eq.${encodeURIComponent(groupId)}&select=*&order=created_at.asc`,
  )) as SchoolMember[];
}

function tokenKey(env: Env) {
  return env.SCHOOL_GROUP_TOKEN_SECRET ?? config(env).key;
}

export function issueMemberToken(env: Env, id: string, createdAt: string) {
  const expiry = Math.floor((new Date(createdAt).getTime() + 30 * 86400000) / 1000);
  const subject = `${id}.${expiry}`;
  const signature = createHmac('sha256', tokenKey(env)).update(subject).digest('base64url');
  return `${subject}.${signature}`;
}

export function verifyMemberToken(env: Env, token: string): string | null {
  const match = /^([0-9a-f-]{36})\.(\d{10})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!match || !match[1] || !match[2] || !match[3] || Number(match[2]) * 1000 < Date.now())
    return null;
  const expected = createHmac('sha256', tokenKey(env))
    .update(`${match[1]}.${match[2]}`)
    .digest('base64url');
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(match[3]))) return null;
  return match[1];
}

export async function memberFromToken(env: Env, token: string) {
  const id = verifyMemberToken(env, token);
  if (!id) return null;
  const member = await getMember(env, id);
  if (!member || issueMemberToken(env, id, member.created_at) !== token) return null;
  const group = await getGroup(env, member.group_id);
  return group && group.status !== 'closed' ? { member, group } : null;
}

export async function decideMember(env: Env, id: string, status: 'confirmed' | 'declined') {
  const rows = (await db(
    env,
    `school_group_members?id=eq.${encodeURIComponent(id)}&confirmation_status=eq.invited&select=id`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        confirmation_status: status,
        ...(status === 'confirmed' ? { confirmed_at: new Date().toISOString() } : {}),
      }),
    },
  )) as { id: string }[];
  return rows.length === 1;
}

export function invitationMessage(
  env: Env,
  member: SchoolMember,
  group: Group,
  reminder: boolean,
): EmailMessage {
  const origin = env.APP_ORIGIN || 'https://www.autoskolabubu.cz';
  const invite = new URL('/gymnazium-manna/pozvanka', origin);
  invite.searchParams.set('token', issueMemberToken(env, member.id, member.created_at));
  const label = group.course_type === 'school' ? 'Školní kurz' : 'Kurz ISP';
  const text = [
    `Ahoj ${member.first_name},`,
    'spolužák tě pozval do společného kurzu Autoškoly BuBu pro Gymnázium Thomase Manna.',
    `${label}: ${schoolPrices[group.course_type].toLocaleString('cs-CZ')} Kč za osobu.`,
    'Potvrď účast nebo pozvání odmítni na svém soukromém odkazu:',
    invite.href,
    'Po potvrzení si sám/sama vybereš termín osobního zápisu na Střížkově. Pozvání samo o sobě není objednávka.',
    'Informace o zpracování osobních údajů: https://www.autoskolabubu.cz/ochrana-osobnich-udaju',
  ].join('\n\n');
  return {
    idempotencyKey: `manna-${reminder ? 'reminder' : 'invite'}-${member.id}`,
    to: member.email,
    subject: reminder
      ? 'Autoškola BuBu – připomínka pozvání do společného kurzu'
      : 'Autoškola BuBu – spolužák tě pozval do společného kurzu 👻',
    text,
    replyTo: 'info@autoskolabubu.cz',
    tag: 'manna-group',
    eventType: reminder ? 'school_group_reminder' : 'school_group_invitation',
  };
}

export async function sendGroupInvitations(env: Env, groupId: string, reminder = false) {
  const group = await getGroup(env, groupId);
  if (!group) throw new Error('Group not found');
  const members = await groupMembers(env, groupId);
  const mail = createTransactionalEmailAdapter(env);
  const results = await Promise.allSettled(
    members.map(async (member) => {
      if (member.confirmation_status === 'declined' || member.existing_order_id) return false;
      if (
        reminder ? member.reminder_sent_at || !member.invitation_sent_at : member.invitation_sent_at
      )
        return false;
      try {
        await mail.send(invitationMessage(env, member, group, reminder));
        await db(env, `school_group_members?id=eq.${member.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            [reminder ? 'reminder_sent_at' : 'invitation_sent_at']: new Date().toISOString(),
          }),
        });
        return true;
      } catch (error) {
        console.warn('school_invitation_failed', {
          memberId: member.id,
          error: error instanceof Error ? error.message : 'unknown',
        });
      }
      return false;
    }),
  );
  return results.filter((result) => result.status === 'fulfilled' && result.value === true).length;
}

export async function pendingGroupIds(env: Env, now = new Date()) {
  const pending = (await db(
    env,
    `school_group_members?select=group_id,created_at,invitation_sent_at,reminder_sent_at,confirmation_status,existing_order_id&created_at=gte.${new Date(now.getTime() - 30 * 86400000).toISOString()}&limit=200`,
  )) as SchoolMember[];
  return [
    ...new Set(
      pending
        .filter(
          (m) =>
            !m.invitation_sent_at ||
            (m.confirmation_status !== 'declined' &&
              !m.existing_order_id &&
              !m.reminder_sent_at &&
              now.getTime() - new Date(m.created_at).getTime() >= 48 * 3600000),
        )
        .map((m) => m.group_id),
    ),
  ];
}

export async function purgeExpiredInvitations(env: Env, now = new Date()) {
  await db(
    env,
    `school_group_members?confirmation_status=in.(invited,declined)&existing_order_id=is.null&created_at=lt.${new Date(now.getTime() - 30 * 86400000).toISOString()}`,
    { method: 'DELETE' },
  );
}

export async function adminGroups(env: Env) {
  const groups = (await db(
    env,
    'school_groups?select=id,course_type,status,coordinator_id,created_at&order=created_at.desc&limit=100',
  )) as Group[];
  const members = groups.length
    ? ((await db(
        env,
        `school_group_members?group_id=in.(${groups.map((g) => g.id).join(',')})&select=id,group_id,first_name,last_name,email,phone,confirmation_status,existing_order_id,created_at&order=created_at.asc`,
      )) as SchoolMember[])
    : [];
  const orderIds = members.map((m) => m.existing_order_id).filter(Boolean);
  const orders = orderIds.length
    ? ((await db(
        env,
        `orders?id=in.(${orderIds.join(',')})&select=id,public_code,status,appointments(starts_at,ends_at)&limit=100`,
      )) as Array<{
        id: string;
        public_code: string;
        status: string;
        appointments: Array<{ starts_at: string }> | { starts_at: string } | null;
      }>)
    : [];
  return groups.map((group) => ({
    ...group,
    members: members
      .filter((member) => member.group_id === group.id)
      .map((member) => ({
        ...member,
        order: orders.find((order) => order.id === member.existing_order_id) ?? null,
      })),
  }));
}

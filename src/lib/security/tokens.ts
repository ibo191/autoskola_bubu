import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
export const createToken = () => {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: tokenHash(token) };
};
export function tokenMatches(token: string, hash: string) {
  if (!/^[a-f0-9]{64}$/.test(hash)) return false;
  return timingSafeEqual(Buffer.from(tokenHash(token), 'hex'), Buffer.from(hash, 'hex'));
}

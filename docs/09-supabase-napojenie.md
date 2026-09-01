# Napojenie Supabase databázy

Objednávky, termíny zápisu, zmeny termínu a interná správa používajú serverový Supabase adaptér. Klient nikdy nedostáva service role key ani priamy prístup do tabuliek.

## 1. Vytvor Supabase projekt

V Supabase vytvor nový projekt a ulož si:

- Project URL: `https://...supabase.co`
- Service role key: iba server, nikdy nie do prehliadača
- Postgres connection string: ideálne pooler/transaction connection string pre migrácie

## 2. Aplikuj migrácie

Lokálne v bezpečnom termináli nastav connection string a spusti:

```bash
SUPABASE_DB_URL="postgresql://..." npm run db:migrate
```

Na Windows PowerShell:

```powershell
$env:SUPABASE_DB_URL="postgresql://..."
npm run db:migrate
Remove-Item Env:SUPABASE_DB_URL
```

Runner vykoná iba migrácie, ktoré ešte nie sú zapísané v `bubu_private.schema_migrations`. Ak sa už vykonaná migrácia zmení, zastaví sa na checksum chybe.

## 3. Nastav Vercel env premenné

Na Verceli nastav minimálne:

```env
APP_ENV=preview
APP_ORIGIN=https://tvoja-vercel-url.vercel.app
SUPABASE_URL=https://tvoj-projekt.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
RATE_LIMIT_SECRET=nahodny-dlhy-secret-min-32-znakov
ADMIN_ACCESS_TOKEN=nahodny-dlhy-token-min-32-znakov
RECAPTCHA_ADAPTER=local
EMAIL_ADAPTER=local
ANALYTICS_ADAPTER=noop
```

Pre kontaktný formulár ešte:

```env
CONTACT_WEBHOOK_URL=https://...
GENERAL_CONTACT_EMAIL=info@autoskolabubu.cz
```

## 4. Čo má po napojení fungovať

- `/api/slots` číta dostupné 20-minútové sloty zo Supabase a podľa potreby ich dogeneruje z otváracích hodín.
- `/api/orders` uloží objednávku, doplnky, súhlasy a rezervovaný termín zápisu.
- `/dekujeme?kod=BUBU-...` zobrazí zhrnutie objednávky a termínu.
- `/spravovat-termin?kod=BUBU-...` umožní zmeniť alebo zrušiť termín.
- `/sprava` zobrazí interný prehľad po zadaní `ADMIN_ACCESS_TOKEN`.

## Bezpečnostné poznámky

- Priamy prístup `anon` a `authenticated` na tabuľky je v migráciách vypnutý cez RLS a revoke pravidlá.
- Web používa iba serverové RPC volania cez service role key.
- Rate limit používa hashovaný fingerprint a samostatné buckety v privátnej schéme.
- Pred ostrým prehodením domény treba vymeniť preview captcha/e-mail adaptéry za produkčné integrácie.

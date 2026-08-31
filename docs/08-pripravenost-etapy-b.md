# Brány před etapou B

**Etapa B není schválena. Etapa A není dokončena.** Tento seznam je příprava; nic z něj nebylo provedeno.

## Nutné dokončit lokálně

- [ ] Schválené ceny, moto pravidla, zápis, merch a právní texty.
- [ ] Nový Astro/TypeScript web, všechny vyřešené veřejné trasy a dokumentované změny bloků.
- [ ] Lokální Supabase/Docker od čistých migrací, pouze bezpečný fiktivní seed.
- [ ] Serverová kalkulace, transakční objednávka, rezervace a ověření e-mailu.
- [ ] Lokální e-mailový náhled a idempotentní scheduler.
- [ ] Individuální Supabase Auth + MFA, owner/operations, audit a RLS/grants testy.
- [ ] Unit, integrační a Playwright testy; security, accessibility, SEO a Lighthouse výsledky.
- [ ] Lokální backup/reset/restore test.
- [ ] Prokázaný fail-closed při production/staging režimu s mock adaptérem.
- [ ] README ověřené na čistém lokálním spuštění.
- [ ] Předání etapy A a samostatné výslovné schválení B od uživatele.

## Teprve po schválení B

- GitHub remote a ochrana hlavní větve.
- Vercel preview/staging a oddělená produkce; nezveřejňovat před schválením.
- Oddělený Supabase EU projekt, testovací a produkční prostředí, zálohy a least privilege.
- Citlivé proměnné v secret manageru, nikoli Git či chat.
- Reálná Google Cloud reCAPTCHA, monitoring score a ochrana replay/action/hostname.
- E-mailový poskytovatel, ověřená odesílací doména, šablony a doručitelnost.
- Autentifikovaný plánovač; ověření retry a idempotence při pádu po send.
- Analytika, consent a konverzní testy bez osobních údajů.
- Úplná historická mapa URL ze Search Console/logů, kontrola redirectů a canonical.
- Aktuální právní a provozní dokumentace včetně zpracovatelů a retence.
- Staging akceptace, bezpečnostní audit, monitoring a produkční smoke test.
- Samostatně naplánované DNS přepnutí, launch a rollback.

## Návrh rollbacku, dosud neprovedený

Před nasazením uchovat původní web a ověřený DNS stav; databázové migrace navrhovat zpětně kompatibilně. Při chybě pozastavit příjem nových objednávek bezpečnou hláškou, zabránit ztrátě již potvrzených rezervací a rozhodnout mezi opravou a návratem předchozího buildu. DNS rollback není náhradou obnovy DB. Ověřit obnovu ze zálohy do odděleného prostředí a konzistenci orders/claims/outbox; respektovat idempotenci již odeslaných e-mailů. Konkrétní RPO/RTO, vlastník zásahu a spouštěcí kritéria vyžadují schválení provozovatele.

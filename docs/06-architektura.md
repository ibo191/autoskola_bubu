# Navržená architektura etapy A

Stav: návrh před implementací. Žádná z následujících bezpečnostních vlastností zatím není deklarována jako otestovaná.

## Jeden projekt, jasné hranice

Astro + strict TypeScript, staticky generované veřejné stránky; serverové API pro objednávku, ověření, rezervaci a správu. Nativní CSS a malé skripty pro modal a filtry. Žádný další aplikační framework, UI kit, ORM ani externí CMS. Astro content collections pro články; Zod schémata konfigurace, katalogu a všech API vstupů. Vercel adaptér je budoucí runtime kompatibilita, nikoli oprávnění vytvořit deployment.

Doménové moduly `catalog`, `pricing`, `booking` nesmějí importovat HTTP framework, e-mailového poskytovatele ani proměnné prostředí. Přijímají typované vstupy, validovanou konfiguraci a explicitní hodiny. HTTP adaptéry řídí limity, autentizaci, captcha a bezpečné odpovědi. Jednotné request/response schéma poslouží lokálnímu serveru i budoucím Functions.

### Adaptéry

| Rozhraní | Etapa A | Etapa B |
| --- | --- | --- |
| Repository | Lokální Supabase PostgreSQL, transakční RPC nebo serverové SQL; paměťová implementace jen v unit testech | Oddělený cloudový Supabase EU |
| CaptchaVerifier | Jednorázové lokální testovací tokeny, action/hostname/expiry/replay a nastavitelné failure scénáře | Google Cloud score-based assessments |
| Mailer | Databázový outbox + lokální náhled, žádný externí SMTP | Schválený poskytovatel s idempotency podporou |
| Analytics | No-op nebo lokální debug s allowlistem událostí a atributů | Consentem řízené schválené integrace |
| Scheduler | Manuální CLI + explicitní clock v testech | Autentifikovaný plánovač povolený až v B |

Konfigurace musí oddělit deployment stage (`local`, `test`, `staging`, `production`) od optimalizovaného Astro buildu. Lokální optimalizovaný build může běžet pouze jako explicitní local na loopbacku. Výslovný production/staging režim odmítne mock, localhost databázi, chybějící secrets nebo neověřenou obchodní konfiguraci. Neošetřovat to pouze kontrolou `NODE_ENV`, která může být production i při lokálním testování buildu. Bude nutný test výchozího buildu i každého startovacího entrypointu. Dokud není implementována etapa B, produkční build má skončit jasnou chybou.

## Cenový engine

Jedno typované, Zod validované verzované místo pro pobočky, kurzy, balíky, převodovky, režimy, doplňky, poplatky a platnost cen. Peníze jako celočíselné haléře. Žádné parsování cen z marketingových textů, generic příplatky nebo tiché fallbacky.

Rozhodovací funkce vrací buď platnou nabídku, konkrétní nepovolenou kombinaci, potřebu další odpovědi, nebo nepokryté pravidlo s kontaktem na autoškolu. Rozlišovat způsobilost nabídky od samotné kalkulace. Chybějící cenový řádek není nula Kč. Seznam již vlastněných oprávnění musí být jednoznačný a bez duplicit; „nemám oprávnění“ je exkluzivní volba.

Server kalkuluje znovu při shrnutí i při založení objednávky. Uloží snapshot položek, konečnou cenu, měnu, verzi pravidel, čas výpočtu a kontext. Změna ceny mezi shrnutím a odesláním vyžaduje nové potvrzení; klientská očekávaná částka se nepovažuje za důvěryhodný vstup.

## Rezervace a model dat

UUID, UTC `timestamptz`, prezentace Europe/Prague. Lokální pravidelné hodiny jako den týdne a lokální čas; výjimky jako konkrétní datum s typem closure/opening override/block. Změny DST řešit explicitně, odmítnout neexistující lokální čas a určit chování pro dvojznačný čas. Deset slotů vytvořit pouze při validní konfiguraci délky a dostupných intervalů. Po obsazení nebo blokování se nesmějí již identifikované sloty přesouvat.

| Entita | Klíčová data a vazby |
| --- | --- |
| `orders` | Kontakt v minimálním rozsahu, course/package/branch, pricing snapshot, verification/order status, timestamps |
| `order_items` | Order FK, product/variant, quantity, jednotková a celková cena, název/verze při objednání |
| `appointments` | Order FK, branch, UTC začátek/konec, stav, hold expiry, revision, přidělené kapacitní místo |
| `opening_hours` | Branch, weekday, místní začátek/konec, platnost, konfigurovaná délka/kapacita |
| `schedule_exceptions` | Branch, datum/interval, typ výjimky, dostupnost; bez osobních údajů v důvodu |
| `appointment_slots` | Materializované platné časy a kapacita; stabilní UUID a verze rozvrhu |
| `slot_claims` | Slot FK, seat ordinal, appointment FK; unikátní aktivní nárok na slot+seat |
| `consent_records` | Order FK, účel, přesné znění/verze, stav, timestamp, zdroj, odvolání |
| `verification_tokens` | Order FK, purpose, hash, expirace, pokusy, použití/revokace |
| `notification_jobs` | Order/appointment FK, typ, appointment revision, due_at, idempotency key, stav a retry |
| `audit_log` | Actor, operace, target UUID, čas, omezený diff bez kontaktů a tokenů |
| `staff_members` | Supabase Auth user FK, owner/operations, active, datum odebrání přístupu |
| `rate_limit_buckets` | HMAC identifikátor IP/e-mailu/telefonu, akce, window, čítač, expirace |

Pomocné tabulky slotů/claims zjednodušují databázové vynucení konfigurovatelné kapacity. Samotný `unique(branch, starts_at)` by nesprávně vynucoval kapacitu jedna. Validaci seat ordinal proti kapacitě a případné překryvy napříč různými časy musí vynutit transakční procedura pod zámkem, nikoli veřejný klient. Pokud se schválí překryv zápisů, je potřeba samostatně určit limit souběžné obsluhy; kapacita jednoho startu není totéž.

### Atomické operace

Založení objednávky: zamknout slot → uvolnit expirované claims → zkontrolovat rozvrh/kapacitu → vložit provisional order/items/consents/appointment/token hash/outbox → commit. Chyba kteréhokoli kroku vrátí celou transakci. E-mail se nesmí posílat před commitem.

Ověření: zamknout token a rezervaci → kontrola účelu, pokusů, expirace, nevyužití a platného holdu → atomicky označit token použitý a rezervaci potvrzenou → vytvořit potvrzení + reminder jobs. Po expiraci nevzkřísit rezervaci, kterou mohl mezitím získat někdo jiný. Resend nevytváří nové objednávky a nesmí neomezeně prodlužovat hold.

Přesun: zamykat původní a cílový slot ve stabilním pořadí → získat nový claim → změnit revision → uvolnit původní claim → zrušit původní reminders → vytvořit nové → audit. Při neúspěchu zůstane původní termín. Cancel uvolní claim a zruší jobs ve stejné transakci. Povolené přechody stavů jsou explicitní, bez libovolného PATCH statusu.

Expirační scheduler pomáhá s úklidem, ale správnost nezávisí na jeho běhu: každá rezervace kontroluje skutečnou expiraci v transakci. Žádný partial index s `now()` jako náhrada vypršení holdu.

### Ověřovací a samoobslužné odkazy

Náhodné vysokentropické tokeny s účelem, hashem a krátkou expirací, rate limit a captcha. Tokeny, kódy a kontakty se nelogují. Vhodnější je kód zadávaný přes POST nebo opaque token ve fragmentu s okamžitým odstraněním z adresního řádku; žádné jméno/e-mail/telefon v URL. GET samo o sobě nepotvrzuje ani neruší rezervaci, aby e-mailové skenery nespouštěly změny. Samoobslužné odkazy jsou expirovatelné/revokovatelné; změna a zrušení mají vlastní captcha actions a CSRF ochranu podle transportu.

### E-maily a připomínky

Outbox se ukládá transakčně. Klíč například `(appointment_id, revision, notification_type)` je unikátní. Reminder 24 h se nevytvoří, pokud potvrzení nastalo až po jeho plánovaném čase; totéž předvídatelně definovat pro 2 h. Claim jobs přes `FOR UPDATE SKIP LOCKED`, kontrolovat aktuální stav/revision před odesláním. Unit testy injektují clock. Lokální preview je pouze loopback, bez reálných osobních údajů. ICS obsahuje UTC časy a bezpečně escapovaný text.

Outbox sám nezaručuje přesně jedno externí doručení při pádu po send před uložením sent. V etapě B vybrat poskytovatele se stejným idempotency key nebo schválit omezení. Provozní e-maily nejsou závislé na marketingovém souhlasu.

## RLS, granty a správa

RLS na každé exponované tabulce, default deny. `anon` nemá SELECT/INSERT/UPDATE/DELETE objednávek ani EXECUTE citlivých procedur. Veřejné API nevyužívá klientský Supabase zápis. `authenticated` bez aktivního staff záznamu a `aal2` nemá přístup.

Operations: objednávky, detail, schválené změny stavů/termínů a provozní rozvrh. Owner navíc správa individuálních členů a rolí; přístupovou revokaci kontrolovat na serveru při každém requestu, ne pouze v dlouho platném JWT. Žádné sdílené účty, žádné vlastní ukládání hesel. Enrollment a verification MFA přes Supabase Auth. Auth cookies HttpOnly, SameSite, secure v HTTPS, expirační a refresh politika testovaná. Nikdy neposuzovat oprávnění jen podle klientského storage flagu.

Zápisové admin akce přes omezené serverové procedury, auditovat actor ID. Service role obejde RLS — to není jeho oprava; na serveru proto znovu validovat a omezit přístup. Je-li potřeba SECURITY DEFINER, fixovaný search_path, plně kvalifikované objekty a explicitní REVOKE EXECUTE od PUBLIC/anon/authenticated, grant pouze konkrétním rolím. Role ani claims nepřebírat z uživatelsky měnitelných metadat.

## HTTP bezpečnost

Zod strict schemas, normalizace Unicode a kontaktů, allowlist polí, limity těla i při chunked přenosu, honeypot, kontrola Origin/CSRF, atomický sdílený rate limiting (ne pouze paměť jedné serverless instance). Captcha kontroluje hostname, action, freshness, validitu a replay. Score threshold se v B kalibruje; nízké skóre může vést k dodatečnému ověření.

CSP bez unsafe-eval, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, ochrana embeddingu; HSTS pouze ve skutečném HTTPS prostředí. Lokálně blokovat nechtěné outbound integrace. Bez secrets v klientském bundle nebo chybové odpovědi, žádné logování request body či token-bearing URL. Citlivé odpovědi `Cache-Control: no-store` a noindex. Testovat také kalendářové a správní endpointy, ne pouze vytvoření objednávky.

## Testovací brány

1. Unit: všechny potvrzené větve cen, omezení, neschválené kombinace, data platnosti, deset slotů, DST a hranice hodin.
2. Databáze: migrace od nuly, rollback, dva souběžné požadavky na poslední místo, expirační závod, grants a RLS pro všechny role + MFA.
3. Integrace: replay/expiry/pokusy tokenu, resend, captcha failures, rate limit přes více instancí, reminder idempotence a přesun/cancel.
4. E2E: předvyplněný i prázdný formulář, všechny dostupné B varianty, moto rozhodování, nepovolené kombinace, upsell, VOP a dobrovolný marketing, lokální e-mail, změny rezervace, správa a mobil/klávesnice.
5. Audit: SEO crawl, schema, accessibility, performance budget, lokální backup/restore a test produkčního fail-closed. Bez těchto výsledků není etapa A dokončena.

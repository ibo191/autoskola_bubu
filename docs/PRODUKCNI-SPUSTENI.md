# Produkční spuštění — Autoškola BuBu

Tento checklist je určený pro přechod na ostrou doménu `www.autoskolabubu.cz`. Produkční build je úmyslně nastavený tak, aby se nezveřejnil s nefunkční databází, e-mailem nebo ochranou formuláře.

## 1. Před změnou DNS

- [ ] V GitHubu je schválený a na větvi `main` commit, který prošel `npm test`, `npm run build` a `npm run test:e2e`.
- [ ] Ve Vercelu je projekt propojený s repozitářem `ibo191/autoskola_bubu` a cílová větev je `main`.
- [ ] Ve Vercelu je přidaná doména `www.autoskolabubu.cz`; apex `autoskolabubu.cz` přesměrovává na `www`.
- [ ] DNS záznamy nastavte přesně podle hodnot, které zobrazí Vercel v nastavení domény. Původní Wix web neodpojujte, dokud Vercel nepotvrdí ověření domény a HTTPS certifikát.
- [ ] Připravte návratový plán: poznamenejte si původní DNS záznamy a kontakt na správce domény.

## 2. Povinné proměnné Vercelu

Nastavte je v **Settings → Environment Variables** pro prostředí **Production**. Hodnoty nikdy neposílejte do chatu, GitHubu ani do klientského kódu.

| Proměnná                    | Účel                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------- |
| `APP_ORIGIN`                | `https://www.autoskolabubu.cz`                                                        |
| `SUPABASE_URL`              | URL projektu Supabase                                                                 |
| `SUPABASE_SERVICE_ROLE_KEY` | serverový service role klíč Supabase                                                  |
| `RATE_LIMIT_SECRET`         | nový náhodný řetězec alespoň 32 znaků                                                 |
| `LETTERMINT_PROJECT_TOKEN`  | token pro transakční e-maily                                                          |
| `ORDER_NOTIFICATION_EMAIL`  | `objednavky@autoskolabubu.cz`                                                         |
| `GENERAL_CONTACT_EMAIL`     | schránka pro obecné dotazy                                                            |
| `REPORT_EMAIL`              | příjemce denních a měsíčních přehledů                                                 |
| `CRON_SECRET`               | nový náhodný řetězec alespoň 32 znaků                                                 |
| `RECAPTCHA_SECRET_KEY`      | tajný klíč Google reCAPTCHA v3                                                        |
| `PUBLIC_RECAPTCHA_SITE_KEY` | veřejný site key Google reCAPTCHA v3                                                  |
| `RECAPTCHA_MIN_SCORE`       | doporučeně `0.5`; při falešných zamítnutích lze po vyhodnocení snížit na `0.4`        |
| `GOOGLE_PLACES_API_KEY`     | serverový klíč pro aktuální Google recenze, omezený na Places API                     |
| `GOOGLE_PLACE_ID_STRIZKOV`  | doporučeně pevné Place ID pobočky Střížkov, aby se vyhledávání profilu nemohlo změnit |
| `PUBLIC_GOOGLE_TAG_ID`      | Google tag loader ID: `AW-17619012335`                                                |

Produkční build bez kritických proměnných skončí chybou. Je to ochrana proti spuštění objednávek, které by se neuložily nebo neposlaly e-mail.

## 3. Google reCAPTCHA v3

- [ ] V Google reCAPTCHA vytvořte klíč typu **v3**.
- [ ] Přidejte domény `www.autoskolabubu.cz` a `autoskolabubu.cz`.
- [ ] Uložte tajný klíč pouze jako `RECAPTCHA_SECRET_KEY` na Vercelu.
- [ ] Site key vložte jako `PUBLIC_RECAPTCHA_SITE_KEY` na Vercelu.
- [ ] Po nasazení odešlete jednu testovací objednávku; neplatný token se musí odmítnout a platná objednávka projít.

reCAPTCHA se načítá až při odeslání objednávky. V zásadách cookies a informacích o soukromí musí být uvedena jako nezbytná bezpečnostní služba Google, včetně účelu prevence zneužití formuláře.

## 4. Supabase a objednávky

- [ ] Produkční Supabase má aplikované všechny migrace z `supabase/migrations/`.
- [ ] Zkontrolujte RLS a RPC práva podle SQL testů v `supabase/tests/database/`.
- [ ] Z veřejného prohlížeče ověřte, že nelze číst tabulky objednávek přímo přes REST API.
- [ ] Ověřte jednu objednávku pro Střížkov a jednu pro Kladno. Střížkov musí vytvořit rezervaci slotu; Kladno objednávku bez slotu.
- [ ] Ověřte obsazení slotu: stejný slot nesmí přijmout dva zákazníky.
- [ ] Zkontrolujte `/sprava`: přihlášení, filtry, kalendář a odhlášení.

## 5. E-mail a cron

- [ ] V Lettermintu ověřte odesílací doménu: SPF, DKIM a doporučeně DMARC.
- [ ] Zkontrolujte adresu odesílatele a odpovědní adresu u objednávky, změny termínu, zrušení a kontaktního formuláře.
- [ ] Testovací objednávka musí doručit e-mail zákazníkovi i interní oznámení na `objednavky@autoskolabubu.cz`.
- [ ] Ověřte odkazy „přidat do kalendáře“, „změnit termín“ a „zrušit termín“.
- [ ] Ve Vercelu ověřte, že cron úlohy existují a `CRON_SECRET` odpovídá jejich autorizaci.

## 6. SEO a indexace

- [ ] Produkční `https://www.autoskolabubu.cz/robots.txt` vrací `Allow: /`, zakazuje `/api/`, `/sprava` a `/spravovat-termin` a uvádí sitemapu.
- [ ] Produkční `https://www.autoskolabubu.cz/sitemap-index.xml` a `sitemap-0.xml` jsou dostupné a obsahují pouze veřejné indexovatelné URL.
- [ ] Veřejné stránky mají `index, follow`; interní stránka, správa termínu, poděkování a právní dokumenty mají `noindex`.
- [ ] Canonical URL vždy směřuje na `https://www.autoskolabubu.cz/...`.
- [ ] V Google Search Console ověřte vlastnictví domény, odešlete sitemapu a nastavte přesměrování starých URL podle `src/redirects.json`.
- [ ] Zkontrolujte titulky a meta popisy pro domovskou stránku, ceník, pobočky, kurzy a blog. Každá stránka má právě jeden `h1`.
- [ ] Neodstraňujte starý Wix web, dokud nejsou DNS, HTTPS, redirects a Search Console ověřené.

## 7. Měření a souhlasy

- [ ] Nastavte `PUBLIC_GOOGLE_TAG_ID=AW-17619012335`. GA4 destination `G-H896QC6DG3` zůstává připojená v Google tagu, ale nepoužívá se jako loader skriptu.
- [ ] Přidejte `PUBLIC_META_PIXEL_ID` až po implementaci a ověření Meta Pixelu.
- [ ] V Google Ads vytvořte dvě konverze: začátek objednávky (krok 2) a dokončená objednávka se zápisem.
- [ ] V Tag Assistantu ověřte, že GA/Ads/Meta se před souhlasem nenačtou a po odmítnutí zůstanou zablokované.
- [ ] Ověřte, že volitelný marketingový souhlas v objednávce je nezaškrtnutý a nezávislý na VOP.

## 8. Finální smoke test po DNS přepnutí

- [ ] Otevřete web v anonymním okně na desktopu i mobilu.
- [ ] Ověřte HTTPS, přesměrování z apex domény na `www`, formulář kontaktu a pobočkové formuláře.
- [ ] Projděte ceník: B manuál, B automat, L17, A1 bez řidičáku, A2 po A1, B96 a B+E.
- [ ] Dokončete testovací objednávku, rezervaci zápisu, potvrzovací e-mail a změnu termínu.
- [ ] Ověřte Google recenze, mapu, všechny dokumenty ke stažení a telefonní odkazy.
- [ ] Projděte Vercel Functions logy, Supabase logy a Lettermint activity; nesmí být chyby 5xx ani neodeslané e-maily.
- [ ] Po úspěšném testu odeberte testovací objednávku podle interního postupu, nikdy ne přímým mazáním bez auditní stopy.

## 9. Rollback

Pokud selže objednávka, rezervace, e-mail nebo HTTPS, okamžitě vraťte DNS na původní ověřený web nebo ve Vercelu propagujte poslední funkční deployment. Neopravujte produkci „za běhu“ bez záznamu; nejdřív zaznamenejte čas, URL, kód objednávky a chybu z Vercel logů.

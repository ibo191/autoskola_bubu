# Průběžný stav — pokračování 31. 8. 2026

Vývoj lokální etapy A pokračuje. Nejde o dokončení etapy A ani schválení etapy B. Nic nenasazovat, nevytvářet vzdálený repozitář ani cloudové služby.

## Poslední závazná upřesnění

- Ceny: aktuální interaktivní ceník na https://www.autoskolabubu.cz/cenik-autoskolabubu (nikoli starší PDF odkazy na tomtéž webu).
- Skupina B má jednu cenu, bez Základ/Jistota: Střížkov 24 900 Kč, Kladno 20 000 Kč, Statenice 24 900 Kč. Automat jen Střížkov; L17 za stejnou cenu pobočky.
- Moto Základ 24 900 Kč, Moto Jistota 31 900 Kč, doplňovací kurz 7 500 Kč; B96 Praha 8 000 Kč, BE 10 500 Kč. Omezení pouze Praha z původního zadání má přednost před nabídkou moto/přívěsů na Kladně v živém ceníku.
- Onboarding je pouze reference designu a struktury bloků, ne závazný ceník ani produkční kód.
- Právní texty dodá provozovatel později. Objednávky jsou zatím vypnuté.
- Starší auditní dokumenty 00–08 zachycují původní stav a některé jejich cenové blokery již neplatí. Toto upřesnění má přednost; jejich sjednocení ještě zbývá.

## Co nyní funguje

- Nový Astro 7.2.9 / strict TypeScript projekt, nativní CSS, lokální Montserrat, dodaná loga a optimalizované fotografie.
- Úvod, vedený ceník, tři pobočky, devět kurzových stránek, průběh výuky, kontakt a O nás.
- Blog přes Content Collections, zatím tři články importované ze současného veřejného webu. Zbytek migrace není hotový.
- Centrální Zod katalog a serverové API `/api/quote`; B bez balíčků, podmíněné moto otázky a bezpečné odmítnutí nepotvrzených kombinací.
- Přístupný tříkrokový dialog: kurz → fiktivní kontakt → jasná informace o neaktivní rezervaci. Kontakt se neodesílá ani neukládá.
- Unit moduly: deset slotů, Europe/Prague/DST, expirace, plán připomínek, tokeny a lokální integrační rozhraní.
- Serverová aplikační služba pro provizorní objednávku: striktní validace, honeypot, serverový přepočet ceny, kontrola verze ceníku, jednorázová CAPTCHA, lokální rate limiting, hash ověřovacího tokenu a e-mail až po úspěšném zápisu. Veřejný endpoint zatím úmyslně není zapojený a právní pojistka vše zavře.
- Brand hierarchie nyní používá primární mint `#4AB9AB` a sekundární modrou `#2F5AA6`; přidán pohybový nástup bez zhoršení kontrastu, interaktivních šest kroků s rozbalovacím detailním textem a kompletní vedený ceník před zobrazením jediné ověřené nabídky.
- Ceník vede přes pobočku, převodovku a L17 nebo přes moto skupinu AM/A1/A2/A, všechna držená oprávnění, rozhodující dvouletou lhůtu a balíky Moto Základ/Moto Jistota. A1→A2 a A2→A po více než dvou letech nabízí doplňovací kurz; ostatní způsobilá rozšíření oba moto balíky. Moto a přívěsy jsou pouze Střížkov, Kladno a Statenice pouze manuál.
- U každé nabídky je upozornění na nezahrnuté poplatky. Samostatně je uvedeno 1 000 Kč autoškole, 700 Kč úřadu pro Prahu/Černošice/Kladno a sazby opakovaných částí 100/200/400 Kč; úřední sazby ověřeny 31. 8. 2026 na Portálu veřejné správy.
- Dodaná sada 25 ikon v modré i tyrkysové variantě je uložená v `src/assets/icons`; lehké lossless WebP varianty jsou v `public/icons/ui`. Používají se v cestě výukou, sekci výhod a kartách poboček. Mapování a pravidla jsou v `docs/IKONY.md`.
- Dvě návrhové SQL migrace, výslovně fiktivní a vypnutý seed, Supabase REST adaptér a připravené pgTAP/integrační testy.
- Právní stránky a `/sprava` jsou poctivě označené neaktivní přípravné stránky, nikoli hotový právní nebo administrační modul.
- Sitemap a část redirect konfigurace. Úplná URL migrace a ověření všech redirectů ještě neproběhly.

## Spuštění

Node >= 22.12, při čisté instalaci `npm ci`.

```powershell
npm run dev
# Vývoj: http://127.0.0.1:4321
npm run build
npm run preview
# Optimalizovaný náhled: http://127.0.0.1:4322
```

Náhled na 4322 se spouští pro E2E testy a po jejich doběhnutí se ukončí. Pro ruční kontrolu jej spusťte přes `npm run preview`. Pokud port již běží, druhé spuštění hlásí EADDRINUSE; není třeba spouštět další instanci.

## Ověřené výsledky

- `npm run build`: úspěch, TypeScript bez chyb, varování i hintů.
- `npm test`: **70/70 prošlo**.
- `npm run test:e2e`: **19/19 prošlo** proti lokálnímu optimalizovanému buildu. Zahrnuje vedený ceník, pobočkové restrikce, manuál/automat/L17, A1 bez oprávnění, A1→A2 pro obě délky držení, oba moto balíky, předvyplnění objednávky, interaktivní cestu, mobil, Tab/Escape a automatické axe kontroly pěti šablon a modalu.
- Automatické axe kontroly nejsou prohlášení o kompletním WCAG auditu.
- První Lighthouse měření úvodu: performance 92, accessibility 100, best practices 100, SEO 69, LCP cca 3,23 s, CLS 0. Jde o lokální laboratorní běh; noindex je v etapě A úmyslný. Výkonový audit ani optimalizace nejsou uzavřené. Raw reporty v ignorovaném `tmp/lighthouse/`.
- Při zastavení již doběhly také ceník: performance 82, LCP cca 2,10 s, CLS 0,325; Střížkov: performance 94, LCP cca 2,85 s, CLS 0,023. Obě accessibility/best-practices 100 a SEO 69. Posun layoutu ceníku je otevřený problém k opravě; neprohlašovat splnění výkonnostních cílů.
- npm při poslední instalaci hlásil 0 známých zranitelností. Nejde o úplný security audit.

## Co nutně zbývá

1. Zprovoznit Docker Desktop / WSL a lokální Supabase. Docker není nalezen a `wsl --status` hlásí, že WSL není instalováno. Pokus `wsl --install --no-distribution` z této relace neuspěl; instalaci je nutné spustit v administrátorském terminálu a pravděpodobně restartovat Windows.
2. Spustit migrace, pgTAP a souběžné DB testy, reset a obnovu. SQL ani DB RLS dosud nebyly vykonány/ověřeny; neoznačovat je za funkční pouze z přítomnosti souborů.
3. Dokončit objednávku, transakční outbox a lokální e-mailový náhled, captcha/rate limiting v API, resend, přesun/storno, bezpečné odkazy, připomínky a retenci.
4. Implementovat skutečnou interní správu přes Supabase Auth + MFA. Žádný přihlášený mock nepovažovat za splnění.
5. Potvrdit délku zápisu, kapacitu, hold TTL, hodiny/místo fyzického zápisu (zejména Kladno), merch a ostatní obchodní blokery. Testovací seedové hodnoty 15 min / 1 místo / 15 min nejsou obchodní rozhodnutí.
6. Dokončit migraci obsahu, zachování všech bloků a URL, doplnit doložené recenze/tým/media, provést úplný SEO/security/accessibility/performance audit.
7. Přenést do objednávkového dialogu také úplnou variantu z ceníku (moto balík a všechna držená oprávnění); kurz a pobočka se už předvyplní. Samotný vedený ceník a serverové rozhodování jsou hotové.
8. Sjednotit starší auditní dokumentaci, doplnit README a provozní návod. Až potom akceptace etapy A; B jen po výslovném schválení.

## Navazující TODO — brand, animace, interaktivní cesta a vedený ceník

Výslovný požadavek uživatele po prohlédnutí náhledu. Práce byla 31. 8. 2026 obnovená; nejdřív se doplnila nezávislá serverová vrstva objednávky a potom níže uvedené UX. Nejde o povolení deploymentu.

- [x] **Důslednější dodržení barevné hierarchie brand manuálu.** Uživatel upřesnil, že vizuál je příjemný, ale dominantní primární barvou musí být mentolově tyrkysová **#4AB9AB** (RGB 74,185,171) a sekundární autoškolská modrá **#2F5AA6** (RGB 47,90,166). Současné tmavozelené plochy a akcenty nesmějí nahrazovat tuto dvojici. Promítnout hierarchii do hlavních ploch, CTA, interaktivní cesty a rozhodovacích bloků ceníku; modrá má být skutečně viditelnou sekundární barvou. Tmavé funkční odstíny používat jen tam, kde je potřeba čitelnost či kontrast, ne jako novou identitu. Ověřit kontrast textů, tlačítek a stavů WCAG AA, dodaná loga nepřebarvovat. Zařazení zůstává až po dokončení rozpracovaných funkcí; nyní jen TODO.
- [x] **Jemné animace načítání a přechodů.** Příjemné postupné objevení obsahu, lehké animace bloků a plynulé změny stavů. Zachovat identitu podle manuálu a rozložení. Bez umělého čekání, blokujícího loaderu nebo zbytečných animačních závislostí.
- [x] **Interaktivní cesta „Jak to probíhá“.** Šest kroků: online objednávka → osobní zápis → teorie → praktický výcvik → volitelná zkouška nanečisto → závěrečná zkouška. Každý krok otevírá vlastní podrobný text a jasně označuje aktivní stav.
- [x] **Ceník nejprve vede otázkami, nabídku ukáže až potom.** Nezobrazovat cenové karty ihned po otevření stránky. Nejprve rozhodovací bloky pro požadovaný kurz, pobočku a pouze relevantní doplňující otázky (převodovka/L17, současné moto oprávnění a případně doba držení). Až po zodpovězení potřebných otázek a validaci ukázat odpovídající nabídku s cenou. B nadále bez cenových balíčků. Nepotvrzená kombinace musí vést ke kontaktu, ne k odhadu ceny.
- [ ] **Plynulý průchod ceníkem.** Animované přechody mezi otázkami i odhalení výsledku, návrat k odpovědím bez ztráty údajů. Při změně rozhodující odpovědi zneplatnit starou nabídku a znovu ji ověřit. Výsledek přenést do objednávky včetně kurzu, pobočky a příslušné varianty.
- [ ] **Ověření nového UX.** Mobil, klávesnice, řízení fokusu, oznámení výsledku asistivním technologiím a `prefers-reduced-motion`. Funkční E2E a automatické axe kontroly nového ceníku prošly; zbývá zopakovat výkonová měření a manuální audit řízení fokusu při odhalování otázek.

## Důležité technické poznámky

- Windows Application Control blokoval natívní Markdown Sätteri. Použit oficiální `@astrojs/markdown-remark`; systémová ochrana nebyla měněna.
- Astro CLI vypíná telemetrii přes `scripts/astro.mjs`. Náhled spouští loopback server přes `scripts/serve-local.mjs`.
- APP_ENV musí být explicitně local; mock adaptéry odmítají production. Zkontrolovat všechny runtime startovací cesty před akceptací.
- E2E běží na 4322 proti buildu, nikoli proti HMR. Selektory selectů používají combobox role; přesný getByLabel u obalujícího labelu s option texty nefungoval.
- Modal má vlastní Tab cyklus, protože samotný nativní dialog při tabování dovolil fokus mimo obsah.
- V pracovním stromu je lokální Git bez remote. Změny zatím nejsou commitnuté.
- Původní `C:/Projekty/Onboarding` zůstává read-only.


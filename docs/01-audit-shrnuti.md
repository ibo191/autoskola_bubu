# Vstupní audit Autoškoly BuBu

Datum kontroly: 2026-08-28. Etapa A, lokální práce. **Nejde o předání dokončeného webu.**

## Zdroje a rozsah

- Referenční zdroje: `C:/Projekty/Onboarding`, pouze čtení. Projekt nalezen přes úlohu „Zistiť úpravy projektu“.
- Nasazený prototyp: https://onboarding-one-delta.vercel.app/strizkov — kontrola viditelného DOM a vzhledu, žádné odeslání formuláře.
- Současný veřejný web: https://www.autoskolabubu.cz/ — čtení indexu a čtyř sitemap, 54 veřejných URL načteno s HTTP 200. Nebyl proveden zápis ani změna nastavení.
- Dodané logo varianty a 12stránkový `logomanual_BUBU.pdf` v Downloads. Textová extrakce a vizuální kontrola pravidel loga, typografie, barev, ochranné zóny a příběhu značky.
- 53 HTML tras prototypu, 41 URL v jeho sitemapě, 9 existujících přesměrování a 38 veřejných renderovacích funkcí/komponent nebo formulářů v inventuře. Počty tras zahrnují aliasy, kampaň a pomocné stránky; nejde o 53 jedinečných obchodních stránek.

Podrobné výsledky jsou v `audit/prototype-pages.json`, `audit/prototype-public-templates.json`, `audit/live-pages.json` a čitelných souborech `audit/*-pages.md`. Mapa URL rozlišuje původní web a prototyp. Není dosud implementována.

## Závažná zjištění

| Oblast | Zjištění | Dopad na nový projekt |
| --- | --- | --- |
| Ceník B | `src/data/courses.ts` a statické FAQ zmiňují Základ/Jistota; aktivní `packageOptionsForCourse` vrací jediný standardní kurz | Vyžádat závaznou tabulku balíků a cen, nekopírovat fallbacky |
| Kladno | Statický katalog uvádí 20 000 Kč; `normalizeData` vynucuje 19 900 Kč | Ani jednu částku nepovažovat za potvrzenou pro nový ceník |
| Jistota automat | Zdroj pro automat uvádí 28 900 Kč, statické FAQ pobočky 32 900 Kč pro B; aktuální UI balík vůbec nenabízí | Potvrdit rozdíly dle převodovky a pobočky |
| Moto | Původní UI vynucuje Jistotu pouze pro A1, ne pro všechny skupiny bez oprávnění | Napsat nové rozhodování podle zadání |
| Přívěsy | Starý katalog nabízí Kladno a generický příplatek za Jistotu | Nové zadání má přednost: pouze Praha; balíky a příplatky nejsou potvrzené |
| Telefon | Střížkov: viditelná hlavička 737 123 456, skutečný tel odkaz 725 717 755; objednávka obsahuje jiný pomocný telefon | Jednotný centrální kontakt, žádné demo telefony |
| Pobočky | Sdílená šablona má natvrdo nadpis „Střížkov konkrétně“ a ID mapy Střížkov i pro jiné pobočky | Oprava chyby bez přeskupování bloků |
| Právní obsah | Prototyp má odkazy `#` a odkazy na nevytvořené právní URL; živá stránka VOP obsahuje nedoplněné pasáže | Vyžádat schválené texty, verze a účinnost; nevydávat draft za platné VOP |
| Recenze | Statické náhradní recenze jsou označovány jako Google recenze; v hlavičce a widgetu jsou odlišné agregace | Přenést pouze doložitelná hodnocení, negenerovat rating ani schema z fallbacku |
| Soukromí | Starý formulář vyžaduje „souhlas“ se zpracováním pro objednávku a nemá samostatný marketing | Přestavět podle zadání; samostatné verzované záznamy |
| Upsell | První doplněk je předvolen; merch má demo sklad a logo místo fotografie | Všechny doplňky nepředvolené, nepřevzít sklad jako skutečný |
| Bezpečnost | Prototyp obsahuje klientský stav objednávek, autentizační příznak v sessionStorage a legacy portálovou synchronizaci | Veškerá backendová a autentizační logika se píše znovu; starý seed se nepřebírá |
| SEO | Obsah se přepisuje JS a existují rozdíly mezi HTML a UI; dostupnost se generuje jako InStock | Statické HTML a schema odvozené ze stejného schváleného obsahu |

Právní zdroj: [současná stránka VOP](https://www.autoskolabubu.cz/terms-and-conditions), zejména oddíl VIII. Jde o zjištění neúplného obsahu, nikoli právní posudek. Potvrzení nových textů náleží provozovateli a jeho právnímu poradci.

## Co lze přenést a co nikoli

Přenést lze ověřené textové podklady, strukturu veřejných šablon, schválené kontakty, skutečné fotografie vozidel a dodaná loga. U každého přeneseného údaje evidovat zdroj. Nepřebírat současný frontendový runtime, komprimovaný app.js, databázi, zákaznická data, účty, API, autentizaci, crony ani Supabase klienta. Starý projekt již měl lokální necommitované změny; nedotýkat se jich.

## Omezení auditu

Audit statického HTML není vizuální kontrola všech responsivních stavů. V prohlížeči byla zkontrolována stránka Střížkov; ostatní šablony byly inventarizovány ze zdrojů. JSON-LD byl ověřen na syntaktickou parsovatelnost, nikoli kompletní shodu se Schema.org. Žádný výsledek se nesmí vydávat za Lighthouse, WCAG, bezpečnostní akceptaci nebo E2E test nového webu.

Úplnost URL platí vůči nalezeným souborům, routingu a sitemapám. Historické URL mimo sitemapu budou před migrací potřebovat export ze Search Console nebo přístupových logů; nyní se žádná produkční služba nepřipojuje.

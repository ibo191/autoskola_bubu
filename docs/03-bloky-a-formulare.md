# Pořadí bloků, formuláře a přenos obsahu

Referenční pořadí níže vychází z aktivních veřejných funkcí rozbaleného `app.js`, nikoli ze starších statických HTML fallbacků. Přesné nadpisy, CTA, atributy formulářů, odkazy a komponentová volání obsahuje `audit/prototype-public-templates.json`. Statické nadpisy každé jednotlivé URL jsou v `audit/prototype-pages.md`.

## Globální prvky

Hlavička → navigace kurzů / průběhu / ceníku / poboček / portálu → hodnocení → telefon → objednávka. Patička obsahuje představení, kontakty, rychlé odkazy a dokumenty. Mobilní sticky CTA, cookie lišta a modální vrstva jsou sdílené.

Odstranit portálové odkazy; změna se týká hlavičky, patičky, popisů benefitů, roadmap, FAQ, článků a metadat, ne pouze navigace. Převést telefon na autoritativní pobočková data. Recenzní agregace ponechat jen po doložení. Interní `/sprava` není marketingový obsah ani součást sitemap.

## Šablony a účel bloků

| Trasy | Referenční pořadí a účel | Povolená změna |
| --- | --- | --- |
| `/` | Hero: hlavní nabídka → oblíbené kurzy: orientace → nejbližší kurzy: kapacita → průběh: vysvětlení → recenze: důvěra → proč BuBu: hodnoty → pobočky: lokalita → FAQ: námitky → finální CTA: objednávka | Vyjmout dostupné kurzy; průběh nahradit pěti kroky; ostatní pořadí zachovat |
| `/strizkov`, `/kladno`, `/statenice` | Hero + důvěryhodnost → nejbližší kurzy → průběh → lokální informace / vhodnost / doprava / mapa → proč BuBu → recenze a FAQ → finální CTA | Odstranit jen nejbližší kurzy; upravit průběh, faktické chyby, kontakt, přístupnost a SEO |
| `/kurzy/ridicak-skupina-b`, `/kurzy/ridicak-skupina-b-automat`, `/kurzy/l17`, `/kurzy/ridicak-skupina-am`, `/kurzy/ridicak-skupina-a1`, `/kurzy/ridicak-skupina-a2`, `/kurzy/ridicak-skupina-a`, `/kurzy/b96`, `/kurzy/be`, `/kurzy/kondicni-jizdy` | Hero → pro koho → obsah kurzu → průběh → ceník/balíky → benefity → obavy → dostupnost → recenze → FAQ → finální CTA; mobilní sticky CTA | Vyjmout dostupnost a neověřené termíny; rozhodovací otázky vložit do stávajícího ceníkového bloku |
| `/cenik` | Úvod → kategorie → pobočka → karty aktivní kategorie → pomoc s výběrem | Zachovat hierarchii; otázky převodovky a režimu před B cenami, moto rozhodování před moto cenami; viditelná sekce Poplatky za zkoušku |
| `/jak-probiha-vyuka` | Hero a uklidňující sdělení → cesta k řidičáku → FAQ | Pět kroků ze zadání namísto portálu a původních šesti kroků |
| `/o-nas` | Úvod → přístup a benefity → hodnoty → tým | Ověřit osoby a fotografie před přenosem; nepřidávat tvrzení |
| `/kontakt` | Hero → tři pobočkové kontaktní karty a otevření pobočkového formuláře | Jednotné kontakty; bezpečný nový formulář |
| `/blog` | Hero → seznam článků | Astro Content Collections; nespoléhat na JS render |
| Všechny `/blog/*` | Titulek, perex/obrázek a obsah → související kurz/CTA → podobné články | Zachovat konkrétní nadpisy článků z inventury; doplnit jen doloženého autora, data a zdroje; opravit odkazy na portál/dostupnost |
| `/shop` | Hero → produkty | Neodhadovat varianty, sklad ani DPH; bez online plateb |
| `/dekujeme-za-vyplneni-objednavky` | Potvrzení odeslání → nastavení hesla → portálové kroky | Přepsat na neověřenou objednávku / ověření e-mailu; neslibovat potvrzenou rezervaci před ověřením |
| `/kampane/jesen` | Samostatná kampaň ve statickém HTML | Vyžaduje rozhodnutí, zda je stále relevantní; inventarizováno, nepřenášet neověřený termín |
| Staré aliasy | Odkaz / redirect na příslušnou novější stránku | Viz mapa URL; odstranit řetězení a prověřit query parametry |

Pobočkový HTML fallback popisuje i bloky kurzů a balíků, které aktivní `locationPage` již nevkládá. Neobnovovat tyto bloky automaticky — změnilo by to referenční živou dispozici. Totéž platí pro nepoužité funkce `locationPriceCatalog` a `locationPackageCards`.

## Objednávkový popup

Původní 3 kroky: údaje/kurz/pobočka/termín kurzu → balík/doplňky/poznámka/splátky → souhrn/souhlasy/odeslání. Vedle formuláře je souhrn. Parametry `data-order`, `data-location`, `data-package`, `data-term` přenášejí výběr z CTA.

Nový proces zachová modal a tři přehledné části: výběr + kontakty → fyzický zápis + nepředvolený upsell → serverový souhrn + VOP + dobrovolný marketing. Následuje ověření e-mailu. Osobní údaje zůstávají v paměti formuláře, nikoli v URL nebo localStorage. Poznámka a splátkový checkbox z objednávky se nepřenášejí, protože zadání výslovně omezuje rozsah sběru; případná domluva proběhne při zápisu.

Nový modal: nativní dialog, označení nadpisu, aktuální krok, focus trap, Escape s potvrzením opuštění rozpracovaných údajů, návrat fokus na spouštěč, chyby napojené `aria-describedby`, mobilní fullscreen, zachování údajů při návratu. Žádná tichá náhrada neplatného kurzu/pobočky/balíku.

## Další popupy

Pobočkový kontakt: jméno, telefon, e-mail, zájem o kurz, pobočka a zpráva. Inventarizovat jako samostatný formulář s `contact_submit`; před implementací potvrdit, zda i tento formulář smí sbírat volnou zprávu (omezení zadání je pro objednávku jednoznačné). Cookie dialog a nastavení souhlasů: pouze lokální debug/no-op, žádné trackery. Produktový popup pro veřejné zobrazení odlišit od starých editačních modalů; interní formuláře starého ERP se nemigrují.

## Query parametry

Nově: `course`, `package`, `branch` pro výběr; samostatně všech pět `utm_*`. Původní aliasy pobočky: `pobocka`, `branch`, `location`. Staré UI navíc hádá pobočku z `utm_content` / `utm_term` a referreru; nová vrstva může známý přesný legacy slug nabídnout k potvrzení, ale nebude přepisovat UTM ani objednávat automaticky podle substringu. Konfliktní explicitní parametry zobrazí chybu. Původní ID `b`, `ba`, `l17`, `am`, `a1`, `a2`, `a`, `be`, `b96` potřebují explicitní mapování; `termId` původního kurzu není slot fyzického zápisu.

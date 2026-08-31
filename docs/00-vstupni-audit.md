# Etapa A — vstupní audit a blokery

Datum: 2026-08-28
Stav: historický první záznam. Podklady byly následně nalezeny; aktuální stav popisuje `01-audit-shrnuti.md` a `05-rozhodnuti-k-potvrzeni.md`. Implementace ani akceptace etapy A nejsou dokončeny.

## Ověřený stav

- Cílový adresář projektu byl při zahájení prázdný.
- Přiložen byl text zadání; v jeho adresáři nebyly další podklady.
- V adresářích Documents/Autoškola, Documents/Autoškola Automatizace a Documents/Codex nebyly při hledání názvů nalezeny požadované brand soubory ani cesta obsahující onboarding. Nejde o kontrolu celého počítače.
- Node.js, npm a Git jsou dostupné v PATH.
- Docker a Supabase CLI nebyly nalezeny v PATH; jejich instalace jinde není vyloučena.
- Nebyl vytvořen remote, deployment, cloudová databáze ani externí integrace.

## Podklady blokující inventuru a implementaci

Aktualizace: všechny tři následující vstupní blokery byly vyřešeny. Onboarding je v `C:/Projekty/Onboarding`, živý web na `https://www.autoskolabubu.cz/`, brand podklady v Downloads. Níže je zachován původní záznam pro dohledatelnost.

1. Přesná lokální cesta k celému referenčnímu projektu onboarding (pouze čtení).
2. Potvrzená URL současného veřejného webu.
3. logomanual_BUBU.pdf, logo_autoskola.png, autoskola_logo.png a logo dlhe.png — soubory nebo jejich přesné cesty.

Dokud nejsou reference dostupné, nelze doložit úplnost URL, pořadí bloků, původní ceny, obsah, analytiku ani vizuální identitu. Produkční kód se před touto inventurou nezačne psát.

## Rozhodnutí k doplnění po auditu referencí

- Otevírací hodiny; délka zápisu; kapacita slotu; expirace holdu.
- Úplné ceny a platnost ceníku; význam a ceny moto rozšíření a doplňovacích zkoušek.
- Moto kombinace více oprávnění, jiné skupiny než B/A1/A2 a hranice přesně dvou let držení (zadání určuje pouze více než dva roky a kratší dobu).
- Výrobky, varianty, ceny, obrázky a předání merche.
- Přiřazení poboček k úřadům; úřední poplatky ověřit na oficiálních zdrojích před implementací.
- Verze VOP, zásad ochrany údajů a samostatného marketingového souhlasu.
- Retence neověřených, zrušených a dokončených objednávek.
- Schválené pokyny k osobnímu zápisu a texty provozních e-mailů.
- Pro etapu B: poskytovatel e-mailu, domény, individuální správci a role, datum migrace. Nyní nevyžadovat hesla, tajné klíče ani skutečné zákaznické údaje.

Neznámé ceny ani pravidla se neodhadují. Nepokryté kombinace musí zastavit výpočet a nabídnout kontakt. Fiktivní hodnoty patří pouze do výslovně označených lokálních testovacích dat.

## Plán navazující práce

1. Inventura tras, bloků, formulářů, CTA, odkazů, metadat, canonical a JSON-LD; audit analytiky a brandu.
2. Mapa původních a nových URL, rozhodovací log, potvrzení blockerů, architektura a datový model.
3. Čistý lokální Git projekt Astro/TypeScript strict, lokální Supabase, migrace a adaptéry s produkčním fail-closed režimem.
4. Veřejné stránky, katalog, cenový engine, objednávkový modal, transakční rezervace, ověření a připomínky.
5. Interní správa se Supabase Auth/MFA, RLS, role a audit.
6. Automatické testy, kontrola přístupnosti, bezpečnosti, SEO a výkonu, obnova databáze a lokální předání.
7. Zastavit. Etapa B vyžaduje samostatné výslovné schválení.

## Výsledky kontrol

Build, unit, integrační, E2E, RLS, accessibility a Lighthouse testy zatím nebyly spuštěny: aplikace ani databáze dosud neexistují.

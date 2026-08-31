# Rozhodnutí potřebná pro dokončení etapy A

Nevyplněné pole není souhlas s výchozí obchodní hodnotou. Lokální testy mohou mít výslovně fiktivní nastavení; veřejný katalog ani budoucí produkce je nesmějí použít.

## 1. Závazný ceník B

Zadání požaduje zachovat Auto Základ a Auto Jistota. Poslední aktivní prototyp ale balíky B odstranil. Potřebujeme potvrdit, že se mají vrátit oba balíky, a jejich přesné ceny a obsah.

| Pobočka | Převodovka | Režim | Základ | Jistota |
| --- | --- | --- | --- | --- |
| Střížkov | Manuál | Standard / L17 — potvrdit, zda stejné ceny | K potvrzení | K potvrzení |
| Střížkov | Automat | Standard / L17 — potvrdit, zda stejné ceny | K potvrzení | K potvrzení |
| Kladno | Manuál | Standard / L17 — potvrdit, zda stejné ceny | K potvrzení | K potvrzení |
| Statenice | Manuál | Standard / L17 — potvrdit, zda stejné ceny | K potvrzení | K potvrzení |

Nalezeno: Střížkov a Statenice základ 24 900 Kč; Kladno 20 000 Kč v katalogu versus 19 900 Kč v aktivní normalizaci. Automat Jistota 28 900 Kč v `src/data/courses.ts`; B Jistota 32 900 Kč ve statickém FAQ Střížkova. Tyto hodnoty jsou důkazy rozporu, ne schválený ceník. Chybí účinnost cen a potvrzený obsah balíků.

## 2. Fyzický zápis a kalendář

| Pobočka | Hodiny nalezené v prototypu | Nevyřešené |
| --- | --- | --- |
| Střížkov | Pondělí a čtvrtek 15:00–18:00 | Délka zápisu, kapacita, expirace holdu |
| Kladno | Úterý a čtvrtek 15:15–17:45 | Která adresa: Cyrila Boudy 2954, nebo Havířská 1141; zda se hodiny týkají zápisu |
| Statenice | Středa 15:00–18:00 | Zda jde o hodiny zápisu, nebo pouze teoretické výuky |

Potvrdit délku zápisu v minutách, kapacitu jednoho slotu, expiraci holdu v minutách, nejbližší povolenou rezervaci a horizont nabídky. Upřesnit, zda jsou sloty navzájem nepřekrývající. Deset časů při 150minutovém otevření nemůže při jedné souběžné návštěvě pojmout deset 20minutových zápisů. Konfigurace takový rozpor musí hlásit, ne zkrátit návštěvu či překročit zavírací dobu.

## 3. Motocykly a přívěsy

Potvrzené zadáním: pouze Praha; bez oprávnění AM/A1/A2/A nabízí jen Moto Jistota a 2 hodiny teorie navíc. A1→A2 a A2→A rozlišují dobu držení; A1→A je rozšíření. Více oprávnění, jiné skupiny a přesně 2 roky se bezpečně zastaví do rozhodnutí.

Potřebujeme závaznou tabulku pro každou cílovou skupinu: základní kurz / rozšíření / doplňovací zkouška, balíky, cena a rozsah. Prototyp ukazuje Moto Základ 24 900 Kč, Moto Jistota 31 900 Kč a doplňovací zkoušku 7 500 Kč se 4 hodinami, ale neřeší kompletní kvalifikaci ani cenovou platnost. Nepotvrzené ceny pro konkrétní větev nebudou dopočtené generickým příplatkem.

Přívěsy: B96 Praha 8 000 Kč, BE 10 500 Kč v katalogu; starší landing B96 začíná na 6 000 Kč kvůli Kladnu. Generic `packageOptionsForCourse` vytváří i „Kurz Jistota“ přidáním 7 000 Kč — toto není dostatečně doložený obchodní balík. Potvrdit skutečné balíky přívěsů. Združený výcvik zůstává mimo online nabídku.

## 4. Merch

| Produkt v prototypu | Nalezená částka | Chybějící / rozporné podklady |
| --- | --- | --- |
| Autoškola? Pohodlně! 2026 | 300 Kč | Potvrdit konečnou cenu; shop používá jinou funkci DPH než objednávka |
| Tričko BuBu | 590 Kč | Reálné fotografie, velikosti, barvy, konečná cena a dostupnost |
| Mikina BuBu | 1 290 Kč | Reálné fotografie, velikosti, barvy, konečná cena a dostupnost |
| Malý Bubák | Nenalezeno | Přesný produkt, cena, fotografie, varianty, předání |

Seedové skladové počty nejsou doklad zásob. `BuBu voňka do auta` z prototypu není totéž co Malý Bubák. Předání je v prototypu obecně „Osobní odběr“; potvrdit, zda při zápisu a na které pobočce. Žádné předvolené produkty a žádná platba online.

## 5. Poplatky

Poplatek autoškole za organizaci zkoušky: **1 000 Kč podle zadání**. Potvrdit, zda jde o každý termín, nebo pouze první zkoušku; bez rozhodnutí nevytvářet vlastní pravidlo pro opravné pokusy.

Na [Portálu veřejné správy](https://portal.gov.cz/sluzby-vs/zkouska-k-ziskani-ridicskeho-opravneni-S47728) ověřeno 2026-08-28: zkouška v celém rozsahu 700 Kč; opakování předpisů 100 Kč; ovládání/údržba 200 Kč; praktická jízda 400 Kč. Jde o celostátní oficiální údaj, nikoli potvrzení přiřazení konkrétní pobočky k úřadu. Ovládání/údržba se nesmí prezentovat jako automatická součást všech nabízených skupin.

Přiřazení pobočka → Praha / Černošice / Kladno a místní platební instrukce zůstávají nepotvrzené. Vyhledávání konkrétních úřadů přineslo i zastaralé dokumenty; ty nebyly přijaty jako aktuální ceník.

## 6. VOP, soukromí a provoz

- Dodat schválené úplné VOP, zásady zpracování a samostatný marketingový souhlas, verze a data účinnosti. Živý web obsahuje draftové pasáže; odkaz označený GDPR navíc vede na VOP.
- Vyjasnit právní význam online objednávky versus uzavření smlouvy při fyzickém zápisu. Odesílací tlačítko a potvrzovací e-mail musí odpovídat schválenému významu.
- Potvrdit uchování neověřených, zrušených a dokončených objednávek, auditních záznamů a důkazů souhlasu; pravidla anonymizace a záloh. Žádná nekonečná retence.
- Potvrdit obsah zprávy „co přinést k zápisu“, storno/přesun a pravidla expirace samoobslužného odkazu. Nevymýšlet poplatek za změnu zápisu.
- Doložit původ recenzí a případné agregované hodnocení. Bez toho zobrazit jen schválený odkaz na profil nebo blok vynechat s rozhodovacím záznamem.

## 7. Rozsah migrace

Současný web má navíc učitelský kurz, školení, tým, FAQ, kampaň a Wix rezervační stránky. Mapa označuje šest nerozhodnutých živých URL. Potvrdit zachování jejich obsahu nebo konkrétní náhradu; nevytvářet nefunkční volby v objednávce. Schválení směru mapy URL není schválením nasazení.

## 8. Technické podmínky

Node 24.17.0, npm 11.13.0 a Git dostupné. Docker a Supabase CLI nebyly nalezeny v PATH ani v kontrolovaných běžných umístěních. Před databázovou etapou je nutné zajistit běžící Docker s Linux kontejnery a lokální Supabase CLI. Instalace systému / virtualizace může vyžadovat souhlas a restart. Databázový mock nenahrazuje splnění požadavku na lokální Supabase.

Produkční e-mail, domény, jmenovití správci a produkční tajemství se v této fázi nesbírají. Pro testy jen fiktivní individuální účty, žádná reálná data.

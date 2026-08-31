# Rozhodovací log

2026-08-28. Stav „přijato“ znamená rozhodnutí v rámci zadání, nikoli hotovou implementaci.

| ID | Stav | Rozhodnutí | Důvod |
| --- | --- | --- | --- |
| ADR-001 | Přijato | Nový samostatný projekt, původní onboarding pouze ke čtení | Výslovné zadání; stará aplikace obsahuje portál, ERP a jiný datový model |
| ADR-002 | Přijato | Pouze lokální etapa A, žádný remote ani deployment | Oddělení vývoje od připojení produkčních služeb |
| ADR-003 | Přijato | Veřejné stránky statické v Astro; serverová obchodní logika oddělená adaptéry | Rychlost, statická čitelnost a testovatelnost |
| ADR-004 | Přijato | Nevykonávat starý app.js při extrakci; pouze gzip decode a statický audit | Neaktivovat synchronizaci, starý seed či externí akce |
| ADR-005 | Přijato | Smazat bloky nejbližších kurzů, ne je přejmenovat | Výslovně mimo nový veřejný web |
| ADR-006 | Přijato | Pět kroků s fyzickým zápisem místo studentského portálu | Nový obchodní proces ze zadání |
| ADR-007 | Přijato | Moto/přívěsy jen Praha, automat jen Praha, moto bez oprávnění pouze Jistota + 2 h teorie | Nové zadání má přednost před prototypem |
| ADR-008 | Čeká na provozovatele | Obnovit balíky B a schválit závaznou cenovou tabulku | Aktivní prototyp a starší obsah si odporují |
| ADR-009 | Přijato | Neznámé cenové větve vrací kontakt, nikoli odhad ceny | Ochrana zákazníka a integrity objednávky |
| ADR-010 | Přijato | Nahradit klientské kapacity transakčními DB claims | Současné požadavky nesmějí překročit kapacitu |
| ADR-011 | Přijato | Upsell nepředvolený, marketing oddělený a nepředvolený | Dobrovolná volba, korektní souhlasy |
| ADR-012 | Čeká na podklady | Neoznačovat fallbackové recenze jako Google hodnocení | Chybí důkaz původu / aktuální agregace |
| ADR-013 | Přijato | Opravit hardcoded Střížkov v jiných pobočkách a nejednotné telefony | Faktické chyby; nikoli redesign struktury |
| ADR-014 | Návrh | Zachovat referenční URL, sloučit obsahově shodné live aliasy přes přesné 301 | Prototyp a současný web mají odlišné URL; finální canonical rozhodnout před migrací |
| ADR-015 | Čeká na provozovatele | Schválené VOP/privacy/marketing před aktivací objednávek | Nalezené texty jsou neúplné, právní účinek objednávky není potvrzený |
| ADR-016 | Návrh | Lokální mapa pobočky bez aktivního Google iframe, odkaz ponechat | Etapa A bez externích integrací; prostor mapy a lokalit zachovat |
| ADR-017 | Návrh | Owner spravuje přístup; operations řeší objednávky/rozvrh; obě role MFA | Nejmenší potřebná oprávnění a individuální odpovědnost |
| ADR-018 | Přijato | Produkční režim odmítne mock i neúplnou konfiguraci | Nelze omylem publikovat testovací objednávku či falešnou captcha |
| ADR-019 | Přijato | Nekopírovat demo sklad, osobní údaje ani hesla ze starého seedu | Jen nové výslovně fiktivní testovací údaje |
| ADR-020 | Čeká na provozovatele | Nepřevádět poznámku a splátkový checkbox do objednávky | Zadání omezuje sbíraná pole; rozsah kontaktního formuláře vyjasnit |

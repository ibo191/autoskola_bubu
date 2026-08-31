# Autoškola BuBu — nový samostatný projekt

**Vývoj byl na přání uživatele 28. 8. 2026 pozastaven. Nový lokální web a cenový výběr již fungují; etapa A není dokončená. Aktuální stav, spuštění, výsledky testů a předání pro pokračování jsou v [docs/POKRACOVANI.md](docs/POKRACOVANI.md). Níže je původní auditní dokumentace; její historické poznámky o neexistující aplikaci již neplatí.**

Původní projekt `C:/Projekty/Onboarding` je pouze referenční a zůstává beze změn. V tomto projektu nebyl vytvořen deployment, cloudový Supabase ani externí integrace. Etapa B vyžaduje samostatné výslovné schválení po dokončení A.

## Dokumentace

1. [Audit a důležitá zjištění](docs/01-audit-shrnuti.md)
2. [Mapa URL](docs/02-mapa-url.md) — návrh, nikoli aktivní redirecty
3. [Pořadí bloků a formuláře](docs/03-bloky-a-formulare.md)
4. [Brand, SEO a analytika](docs/04-brand-seo.md)
5. [Rozhodnutí k potvrzení](docs/05-rozhodnuti-k-potvrzeni.md)
6. [Architektura, model dat a RLS](docs/06-architektura.md) — návrh před implementací
7. [Rozhodovací log](docs/07-rozhodovaci-log.md)
8. [Brány etapy B](docs/08-pripravenost-etapy-b.md)

## Reprodukce auditu

Vyžaduje Python 3 a `pypdf` pro čtení brand manuálu. Skripty používají standardní knihovnu pro extrakci HTML; starý JavaScript se nikdy nespouští. Použité cesty k referencím jsou záměrně lokální. Nevytvářejí aplikaci ani testovací databázi.

```powershell
python scripts/extract-reference.py
python scripts/audit-reference.py
# Pouze pokud jsou dostupné lokální kopie živého webu:
python scripts/audit-reference.py --cached-live
python scripts/build-audit-report.py
```

Volba `--live` čte veřejné URL na autoskolabubu.cz a potřebuje síťové oprávnění a lokální kopii sitemap indexu v `tmp/audit/live-sitemap.xml`. Žádné formuláře neodesílá. Raw HTML, rozbalený referenční runtime a PDF rendery jsou v ignorovaném `tmp/`; nepatří do nové aplikace ani Git historie. Inventury v `docs/audit/` evidují veřejný obsah a schémata formulářů, ne zákaznická data.

## Lokální aplikace a testy

Startovací postup aplikace bude doplněn až při její implementaci a ověřen proti čisté instalaci. Není zde zatím `npm run dev`, funkční objednávka, SQL migrace ani Supabase stack. Node 24.17.0, npm 11.13.0 a Git jsou dostupné; Docker a Supabase CLI zatím nebyly nalezeny v kontrolovaných umístěních.

Build, unit, databázové integrační, Playwright, accessibility, security a Lighthouse testy nového webu **dosud neproběhly**. Úspěšný audit 54 veřejných URL a syntaktická kontrola JSON-LD nejsou náhradou těchto testů.

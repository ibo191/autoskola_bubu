# Autoškola BuBu

Web Autoškoly BuBu postavený na Astro. Obsahuje veřejný web, ceník a objednávkový průvodce, rezervaci zápisu, správu objednávek a sezónní kampaně.

## Produkční spuštění

Před přepnutím domény projděte [produkční checklist](docs/PRODUKCNI-SPUSTENI.md). V produkci aplikace záměrně odmítne běžet bez databáze, odesílání e-mailů, omezení požadavků a reCAPTCHA.

## Lokální spuštění

```powershell
npm install
npm run dev
```

Kontroly před vydáním:

```powershell
npm test
npm run build
```

## Dokumentace

- [Produkční checklist](docs/PRODUKCNI-SPUSTENI.md)
- [Původní audit a mapa URL](docs/01-audit-shrnuti.md)
- [Architektura a model dat](docs/06-architektura.md)

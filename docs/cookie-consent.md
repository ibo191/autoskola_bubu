# Cookie consent Autoškola BuBu

Tahle implementace je připravená pro současnou vývojovou doménu a pozdější přechod na produkční doménu. Nepřipojuje Google Analytics, Google Ads ani Meta Pixel. Všechny budoucí měřicí skripty musí zůstat za souhlasem uživatele.

## Kategorie

- Nezbytné: vždy aktivní. Slouží pro fungování webu, objednávku, interní relace a uložení cookie volby.
- Analytické: vypnuté do udělení souhlasu.
- Marketingové: vypnuté do udělení souhlasu.

## Technické uložení volby

Souhlas se ukládá do first-party cookie `bubu_cookie_consent` s verzí `1`. Pokud se v budoucnu změní účely zpracování nebo přibude nový poskytovatel, zvyšte verzi v `src/lib/consent.ts` i v komponentě `src/components/CookieConsent.astro`. Starší volby se tím zneplatní a uživatelé dostanou nové nastavení.

## Budoucí zapojení Google/Meta

Při zapojení měření vložte skutečné volání pouze do centrální vrstvy okolo `src/lib/tracking.ts` a spouštějte jej až po kontrole příslušné kategorie:

- Google Analytics: analytics
- Google Ads conversion / remarketing: marketing
- Meta Pixel: marketing

Do té doby musí kontrolní testy dál potvrzovat, že web neposílá požadavky na Google/Meta trackovací endpointy.

## Změna souhlasu

Uživatel může panel otevřít odkazem „Nastavení cookies“ v patičce webu nebo tlačítkem na stránce `/zasady-pouzivani-cookies`.

# Brand, SEO a analytika — výchozí audit

## Brand

Autorita: dodaný `logomanual_BUBU.pdf`, stránky 2–5 a 7–12 (číslování PDF).

- Tyrkysová RGB 74,185,171 = `#4AB9AB`; modrá RGB 47,90,166 = `#2F5AA6`; bílá `#FFFFFF`; černá `#000000`.
- Montserrat; manuál ukazuje Extra Light, Light, Medium a Extra Bold. Na webu preferovat čitelné Medium pro běžný text a Extra Bold pro akcentované nadpisy. Fonty hostovat lokálně s doloženou licencí; soubory fontů nebyly v dodaných podkladech nalezeny.
- Logo neměnit barvou, tvarem, proporcemi ani textem. Dodaná vodorovná varianta na světlém podkladu; na tmavém pozadí nepoužívat improvizovaný CSS invert, nýbrž schválenou variantu či světlou podložku.
- Ochranná zóna vychází z výšky písmene B v ukázce manuálu. Minimum 4 cm je tiskové pravidlo; webové rozměry musí zachovat čitelnost a proporce, nikoli předstírat fyzické centimetry obrazovky.
- Tón: klid, přátelskost, respekt, bezpečí; žádné efekty soutěžící s obsahem. Upravit nekonzistentní tykání/vykání až při obsahové redakci.

Tokeny budou rozlišovat původní brand barvy a přístupné funkční varianty. Tyrkysová nesmí být automaticky použita jako pozadí pod běžným bílým textem bez kontroly kontrastu. Funkční text, focus, hover a chyby potřebují WCAG kontrolu. Dále centrální škála typografie, spacingu, rádiusů, stínů a pohybu. Breakpointy budou dokumentované konstanty media queries — CSS custom property nelze běžně použít jako hodnotu podmínky media query. Zohlednit reduced motion.

## Technické SEO

Prototyp má globální `X-Robots-Tag: noindex, nofollow, noarchive, nosnippet` a `robots.txt: Disallow: /`. To odpovídá jeho testovacímu účelu; tyto hodnoty nesmějí bez rozlišení prostředí přejít na budoucí produkci. V etapě A ponechat celé lokální prostředí neindexovatelné.

Všech 53 HTML tras má title; jedna kampaň nemá canonical. Parsování přítomných JSON-LD bloků nehlásilo syntaktickou chybu. Nejde o potvrzení pravdivosti ani platnosti všech typů/vlastností. Statické FAQ, ceny a nabídky se rozcházejí s renderovaným UI. Původní SearchAction vyžaduje ověření skutečně fungujícího vyhledávání. Nepřenášet Offer/InStock, sezónní termíny ani Review/AggregateRating bez faktického podkladu.

Živý web má 54 URL v sitemapách a všechny byly načteny s HTTP 200; některé mají obsah navíc načítaný JavaScriptem. Jediný HTTP 200 neprokazuje kvalitní indexaci. V HTML `/cenik-autoskolabubu` nebyl nalezen H1 ani smysluplná cenová sekce; dvě rezervační service-page URL také nemají ve staženém HTML H1. V produkční sitemapě jsou i `copy-of-*` a starý kurz. Rozhodnout o obsahu, nikoli slepě přesměrovat všechno.

Produkční články mají `/post/*`, často s diakritikou; prototyp `/blog/*`. Jeden slug obsahuje vizuálně podobné cyrilické „а“. Mapovat přesně původní Unicode i korektně URL-encoded cestu, ne plošným odstraněním diakritiky. Navržené cíle a nevyřešené stránky jsou v mapě URL. Finální volba canonical se musí řídit zachováním organické hodnoty a obsahovou shodou; realizace redirectů neznamená povolení deploymentu.

Nový obsah: jeden H1, logické nadpisy, unikátní metadata, canonical z explicitní konfigurace, OG/social image, breadcrumbs, statické články a pobočky, sitemap index. Schema emitovat jen z centrálních schválených dat a ověřit proti oficiálnímu Schema.org před implementací. AI čitelnost vychází z dostupného HTML, autorů, skutečných aktualizací, zdrojů a konkrétních odpovědí; neslibuje výsledky vyhledávání.

## Analytika

Ve staženém veřejném HTML nalezen identifikátor Google Ads `AW-17619012335`. V provedeném vyhledání nebyl nalezen GTM ani GA4 identifikátor; není to důkaz jejich nepřítomnosti v dynamické konfiguraci Wix. Meta Pixel a skutečné konverzní cíle dosud nejsou ověřené. Nic nebylo aktivováno, měněno ani připojeno.

Prototyp má `data-event` události a UTM source/medium/campaign, ale ne úplný konzistentní pět-parametrový kontrakt. Zachycení UTM nesmí ovlivňovat cenu ani serverovou platnost objednávky. V etapě A použít allowlist obchodních atributů a lokální debug výpis bez jmen, e-mailů, telefonů, textů formulářů, surových URL nebo verification tokenů. Syrové UTM mohou obsahovat osobní údaje, proto je nepropouštět neomezeně do analytiky.

## Budoucí ověření

- Kontrola redirectů bez cyklů, řetězů a ztráty produktových parametrů; všechny odkazy na stránky musí mít cíl.
- Schema.org validace každé šablony a kontrola souladu s viditelným textem.
- Playwright + axe, ruční klávesnice, 200–400% zoom, mobilní viewport a reduced motion.
- Lighthouse na lokálním buildu; čísla teď nejsou k dispozici. Reálné p75 CWV až při skutečné produkční návštěvnosti v etapě B.
- Počáteční navržený budget: veřejný JS do 40 kB gzip, objednávkový chunk do 80 kB gzip, fonty do 120 kB a hero obrázek do 200 kB na mobilu. Jsou to technické cíle k měření, nikoli naměřené výsledky.

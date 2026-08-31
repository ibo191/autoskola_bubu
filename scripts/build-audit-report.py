"""Create a proposed URL map and readable per-page inventories from audited sources."""
import json
import re
import unicodedata
from pathlib import Path
from urllib.parse import urlparse, unquote

OUT = Path('docs/audit')
prototype = json.loads((OUT/'prototype-pages.json').read_text(encoding='utf-8'))
live = json.loads((OUT/'live-pages.json').read_text(encoding='utf-8'))
templates = json.loads((OUT/'prototype-public-templates.json').read_text(encoding='utf-8'))
routes = {p['url'] for p in prototype}

def plain(value):
    return ''.join(c for c in unicodedata.normalize('NFKD', value) if not unicodedata.combining(c)).replace('а','a')

def safe(value):
    return str(value).replace('|',' / ').replace('\n',' ')

special = {
    '/onas':'/o-nas', '/cenik-autoskolabubu':'/cenik',
    '/strizkovcenik':'/cenik?branch=strizkov','/kladnocenik':'/cenik?branch=kladno','/statenicecenik':'/cenik?branch=statenice',
    '/a-kurz':'/kurzy/ridicak-skupina-a','/kurz-a':'/kurzy/ridicak-skupina-a',
    '/kurz-a1':'/kurzy/ridicak-skupina-a1','/kurz-a2':'/kurzy/ridicak-skupina-a2','/kurz-am':'/kurzy/ridicak-skupina-am',
    '/kurz-b':'/kurzy/ridicak-skupina-b','/kurz-b-stary':'/kurzy/ridicak-skupina-b',
    '/kurz-bl17':'/kurzy/l17','/ba-ridicak-na-automat':'/kurzy/ridicak-skupina-b-automat',
    '/b96':'/kurzy/b96','/be':'/kurzy/be',
    # Preserve existing non-duplicate public paths unless their content is unresolved.
    '/casto-kladene-dotazy':'/casto-kladene-dotazy','/team':'/team',
    '/terms-and-conditions':'/terms-and-conditions','/copy-of-vop-1':'/copy-of-vop-1',
    '/prihlasitse':'/prihlasitse',
}
articles = {
    'co-komisar-sleduje-u-zkousky-v-autoskole-checklist-pro-studenty-v-praze':'co-komisar-sleduje',
    'jak-vybrat-autoskolu-praha':'autoskola-praha-8-jak-vybrat',
    'nejlevnejsi-autoskola-v-praze-v-roce-2026-kde-se-opravdu-vyplati':'nejlevnejsi-autoskola-praha-2026',
    'proc-je-dulezite-ridit-s-jistotou-bezpecne-jizdni-navyky':'bezpecne-jizdni-navyky',
}
mapping = []
for row in prototype:
    path = row['url']
    mapping.append({'source':'prototype','oldPath':path,'proposedPath':row['redirect'] or path,
                    'decision':'existing redirect' if row['redirect'] else 'preserve',
                    'status':'proposed-not-implemented'})
for row in live:
    path = unquote(urlparse(row['url']).path) or '/'
    target = special.get(path)
    if path.startswith('/post/'):
        slug = plain(path.removeprefix('/post/'))
        candidate = '/blog/'+articles.get(slug,slug)
        target = candidate if candidate in routes else None
    if target is None and path in routes:
        target = next((p['redirect'] for p in prototype if p['url']==path), None) or path
    if target is None:
        decision = 'owner decision: preserve content or approve replacement; do not redirect to home'
    elif target == path:
        decision = 'preserve; legal content requires approved version' if 'vop' in path or 'terms-' in path else 'preserve'
    else:
        decision = 'proposed 301 to equivalent prototype page; review canonical and content parity before implementation'
    mapping.append({'source':'live','oldPath':path,'proposedPath':target,'decision':decision,'status':'proposed-not-implemented'})
for path in ['/pobocky','/faq','/vseobecne-obchodni-podminky','/zasady-ochrany-osobnich-udaju']:
    mapping.append({'source':'prototype-js-link','oldPath':path,'proposedPath':None,'decision':'link-only route; confirm target and provide actual page','status':'unresolved'})
for path in ['/onboarding/*','/student/*','/admin/*','/dashboard','/students/*','/lessons','/calendar','/lectures','/evidence','/exams','/payments','/communication','/fleet','/statistics','/settings','/mobile/*']:
    mapping.append({'source':'legacy-portal','oldPath':path,'proposedPath':None,'decision':'remove legacy functionality; noindex 410 or explicit information page at launch; new staff access at /sprava','status':'proposed-not-implemented'})
(OUT/'url-map.json').write_text(json.dumps(mapping,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
lines = ['# Mapa URL — návrh, nikoli provedená migrace','','Datum: 2026-08-28. Původ rozlišuje prototyp a aktuální veřejný web. Všechny cíle vyžadují kontrolu obsahové shody; nevyřešené URL se nesmějí automaticky přesměrovat na homepage. Duplicity lze sjednotit až po rozhodnutí o canonical.','','| Zdroj | Původní cesta | Navržená cesta | Rozhodnutí |','| --- | --- | --- | --- |']
lines.extend('| '+' | '.join(safe(x[k] or 'NEVYŘEŠENO') for k in ['source','oldPath','proposedPath','decision'])+' |' for x in mapping)
(Path('docs')/'02-mapa-url.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')
for name, data in [('prototype',prototype),('live',live)]:
    lines = [f'# Inventura stránek: {name}','','Extrakce ze zdrojového HTML, ne audit dokončené aplikace. U prototypu obsah po spuštění JS nahrazuje HTML; skutečné pořadí šablon popisuje dokument 03. Veškeré původní odkazy, pole, meta atributy a JSON-LD jsou v sousedním JSON.']
    for row in data:
        lines.extend(['',f"## {row['url']}",'',f"Title: {row.get('title','')}",f"Canonical: {', '.join(row.get('canonical',[]))}",'','Nadpisy v pořadí zdroje:',''])
        lines.extend(f"- H{h['level']}: {h['text']}" for h in row.get('headings',[]))
        description = next((m.get('content') for m in row.get('meta',[]) if m.get('name')=='description'),'CHYBÍ')
        lines.extend(['',f'Description: {description}',f"Počet formulářů: {len(row.get('forms',[]))}; polí: {len(row.get('fields',[]))}; odkazů/CTA: {len(row.get('links',[]))}; JSON-LD bloků: {len(row.get('jsonld',[]))}."])
    (OUT/f'{name}-pages.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')
summary = {'prototypeHtmlRoutes':len(prototype),'liveSitemapUrls':len(live),
           'liveStatusCounts':{str(status):sum(r.get('status')==status for r in live) for status in set(r.get('status') for r in live)},
           'prototypeMissingCanonical':[r['url'] for r in prototype if not r['canonical']],
           'prototypeInvalidJsonld':[r['url'] for r in prototype if any('parseError' in j for j in r['jsonld'])],
           'liveMissingH1':[r['url'] for r in live if not any(h['level']==1 for h in r.get('headings',[]))],
           'liveUnresolvedUrlDecisions':[r['oldPath'] for r in mapping if r['source']=='live' and r['proposedPath'] is None]}
(OUT/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(summary,ensure_ascii=False))

"""Read-only reference inventory. Never imports or runs legacy JS or reads .env.

Run after extract-reference.py. Optional --live fetches public sitemap URLs only.
Raw downloaded HTML stays in ignored tmp/audit, not application source.
"""
import argparse
import concurrent.futures
import hashlib
import json
import re
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(r'C:\Projekty\Onboarding')
OUT = Path('docs/audit')
OUT.mkdir(parents=True, exist_ok=True)
TEMP = Path('tmp/audit')
TEMP.mkdir(parents=True, exist_ok=True)
ORIGIN = 'https://www.autoskolabubu.cz'
NS = {'s': 'http://www.sitemaps.org/schemas/sitemap/0.9'}


class Page(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.result = dict(title='', meta=[], canonical=[], headings=[], sections=[], links=[], forms=[], fields=[], scripts=[], jsonld=[])
        self.captures = []

    def handle_starttag(self, tag, pairs):
        attrs = dict(pairs)
        if tag == 'meta':
            self.result['meta'].append(attrs)
        if tag == 'link' and 'canonical' in attrs.get('rel', ''):
            self.result['canonical'].append(attrs.get('href', ''))
        if tag in ['section', 'form', 'input', 'textarea', 'select']:
            key = 'sections' if tag == 'section' else 'forms' if tag == 'form' else 'fields'
            # No entered/default values: inventory schema, never customer data.
            self.result[key].append({k: v for k, v in attrs.items() if k in ['id', 'class', 'name', 'type', 'action', 'method', 'required', 'aria-label']})
        if tag == 'script':
            self.result['scripts'].append({k: v for k, v in attrs.items() if k in ['src', 'type', 'defer', 'async']})
        if tag in ['h1','h2','h3','h4','title','a','button'] or (tag == 'script' and attrs.get('type') == 'application/ld+json'):
            self.captures.append({'tag':tag, 'buffer':[], 'attrs':attrs})

    def handle_data(self, data):
        for capture in self.captures:
            capture['buffer'].append(data)

    def handle_endtag(self, tag):
        matching = [c for c in self.captures if c['tag'] == tag]
        if not matching:
            return
        capture = matching[-1]
        self.captures.remove(capture)
        raw = ''.join(capture['buffer'])
        text = re.sub(r'\s+', ' ', raw).strip()
        if tag == 'title':
            self.result['title'] = text
        elif tag.startswith('h'):
            self.result['headings'].append({'level': int(tag[1]), 'text': text})
        elif tag in ['a', 'button']:
            self.result['links'].append({'tag': tag, 'text': text, **{k:v for k,v in capture['attrs'].items() if k in ['href','data-go','data-order','data-package','data-location','data-contact-branch','data-event']}})
        elif tag == 'script':
            try:
                self.result['jsonld'].append(json.loads(raw))
            except ValueError:
                self.result['jsonld'].append({'parseError': True})


def parse(text):
    page = Page()
    page.feed(text)
    return page.result


def write(name, data):
    (OUT/name).write_text(json.dumps(data, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')


def get(url):
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != 'https' or parsed.netloc != 'www.autoskolabubu.cz' or parsed.query:
        raise ValueError('Only public, query-free reference URLs are allowed')
    encoded_url = urllib.parse.urlunsplit((parsed.scheme, parsed.netloc, urllib.parse.quote(parsed.path, safe='/%'), '', ''))
    request = urllib.request.Request(encoded_url, headers={'User-Agent': 'BuBu-local-migration-audit/1.0'})
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read(8_000_000).decode('utf-8'), response.status, response.geturl(), {key:response.headers.get(key) for key in ['X-Robots-Tag','Content-Type','Content-Security-Policy']}


def live():
    previous_path = OUT/'live-pages.json'
    previous = {r['url']:r for r in json.loads(previous_path.read_text(encoding='utf-8'))} if previous_path.exists() else {}
    sitemap = ET.fromstring((TEMP/'live-sitemap.xml').read_text(encoding='utf-8'))
    urls = set()
    for loc in sitemap.findall('.//s:loc', NS):
        content, _, _, _ = get(loc.text)
        (TEMP/Path(urllib.parse.urlparse(loc.text).path).name).write_text(content, encoding='utf-8')
        urls.update(e.text for e in ET.fromstring(content).findall('.//s:loc', NS))
    write('live-sitemap-urls.json', sorted(urls))

    def inspect(url):
        try:
            digest = hashlib.sha256(url.encode()).hexdigest()[:16]
            cache = TEMP/f'live-{digest}.html'
            if cache.exists():
                prior = {k:v for k,v in previous.get(url, {}).items() if k in ['status','finalUrl','headers']}
                return {'url':url, **prior, 'cached':True, **parse(cache.read_text(encoding='utf-8'))}
            content, status, final, headers = get(url)
            cache.write_text(content, encoding='utf-8')
            return {'url':url, 'status':status, 'finalUrl':final, 'headers':headers, **parse(content)}
        except Exception as error:
            return {'url':url, 'error':type(error).__name__}

    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        result = list(pool.map(inspect, sorted(urls)))
    write('live-pages.json', result)
    print(json.dumps({'liveUrls':len(urls), 'parsed':sum('error' not in r for r in result), 'errors':[r for r in result if 'error' in r]}))


def local():
    config = json.loads((ROOT/'vercel.json').read_text(encoding='utf-8'))
    redirects = {r['source']:r['destination'] for r in config['redirects']}
    routes = []
    for file in sorted(ROOT.rglob('*.html')):
        rel = file.relative_to(ROOT)
        if any(part in ['node_modules','.git','tmp','.agents','onboarding','student'] for part in rel.parts):
            continue
        url = '/'+rel.as_posix().removesuffix('index.html').rstrip('/')
        text = file.read_text(encoding='utf-8-sig')
        routes.append({'url':url, 'file':rel.as_posix(), 'sha256':hashlib.sha256(text.encode()).hexdigest(), 'redirect':redirects.get(url), **parse(text)})
    write('prototype-pages.json', routes)
    code = (TEMP/'prototype-app.decoded.js').read_text(encoding='utf-8')
    matches = list(re.finditer(r'^(?:async )?function (\w+)\(', code, re.M))
    names = {'homePage','coursesPage','coursePage','pricingPage','locationsPage','locationPage','learnPage','faqPage','contactPage','thankYouPage','aboutPage','blogPage','blogArticlePage','shopPage','orderModal','contactBranchModal','modalHtml','cookieConsentBanner','nav','footer','siteStickyCta','pricingAutoPackages','pricingMotoPackages','orderUpsellMarkup','orderChoiceMarkup'}
    functions = []
    for index, match in enumerate(matches):
        name = match.group(1)
        if name not in names and not name.startswith('Course'):
            continue
        end = matches[index+1].start() if index+1 < len(matches) else len(code)
        body = code[match.start():end]
        parsed = parse(body)
        functions.append({'name':name, 'line':code.count('\n',0,match.start())+1, **parsed,
                          'componentCalls':re.findall(r'\$\{([A-Za-z_]\w*)\(',body),
                          'note':'Static template extraction. Dynamic expressions require source/DOM review; not an executed render.'})
    write('prototype-public-templates.json', functions)
    write('prototype-routing.json', {'redirects':config['redirects'], 'removedLegacyRewrites':config['rewrites'], 'removedCrons':config['crons']})
    sitemap_urls = [e.text for e in ET.parse(ROOT/'sitemap.xml').findall('.//s:loc',NS)]
    write('prototype-sitemap-urls.json', sitemap_urls)
    print(json.dumps({'htmlRoutes':len(routes), 'sitemapUrls':len(sitemap_urls), 'publicTemplates':len(functions), 'legacyRedirects':len(redirects)}))


def reparse_cached_live():
    data = json.loads((OUT/'live-pages.json').read_text(encoding='utf-8'))
    for row in data:
        digest = hashlib.sha256(row['url'].encode()).hexdigest()[:16]
        cache = TEMP/f'live-{digest}.html'
        if cache.exists():
            row.update(parse(cache.read_text(encoding='utf-8')))
    write('live-pages.json', data)
    print(json.dumps({'reparsedLocalCopies':len(data)}))


if __name__ == '__main__':
    options = argparse.ArgumentParser()
    options.add_argument('--live', action='store_true')
    options.add_argument('--cached-live', action='store_true')
    args = options.parse_args()
    local()
    if args.live:
        live()
    elif args.cached_live:
        reparse_cached_live()

"""Import plain-text blocks from audited public Wix HTML, never execute page scripts.

Only non-commercial articles selected for initial migration. Full editorial/media
migration remains on the acceptance checklist. Original images are not substituted.
"""
import hashlib
import json
from pathlib import Path
from html.parser import HTMLParser

SELECTED = {
    '/post/prvni-jizda-v-autoskole-priprava': 'prvni-jizda-v-autoskole-priprava',
    '/post/proč-se-v-autoškole-bojím-dělat-chyby-a-je-to-normální': 'proc-se-v-autoskole-bojim-delat-chyby-a-je-to-normalni',
    '/post/4-nejčastější-chyby-kvůli-kterým-lidé-neudělají-zkoušku-v-autoškole': '4-nejcastejsi-chyby-kvuli-kterym-lide-neudelaji-zkousku-v-autoskole',
}

class Blocks(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tag = None
        self.text = []
        self.blocks = []
        self.title = ''
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag in ('p','h2','h3') and attrs.get('id','').startswith('viewer-'):
            self.tag = tag
            self.text = []
        if tag == 'h1' and attrs.get('data-hook') == 'post-title':
            self.tag = tag
            self.text = []
    def handle_data(self, text):
        if self.tag:
            self.text.append(text)
    def handle_endtag(self, tag):
        if tag == self.tag:
            text = ' '.join(''.join(self.text).split())
            if tag == 'h1':
                self.title = text
            elif text:
                self.blocks.append((tag, text))
            self.tag = None

pages=json.loads(Path('docs/audit/live-pages.json').read_text(encoding='utf-8'))
destination=Path('src/content/articles')
destination.mkdir(parents=True,exist_ok=True)
for page in pages:
    path=page['url'].replace('https://www.autoskolabubu.cz','')
    if path not in SELECTED:
        continue
    schema=next(s for s in page['jsonld'] if s.get('@type')=='BlogPosting')
    filename='live-'+hashlib.sha256(page['url'].encode()).hexdigest()[:16]+'.html'
    parser=Blocks()
    parser.feed((Path('tmp/audit')/filename).read_text(encoding='utf-8'))
    assert parser.title and len(parser.blocks)>4
    metadata={
        'title':parser.title,'description':schema['description'],'slug':SELECTED[path],
        'canonical':'https://www.autoskolabubu.cz/blog/'+SELECTED[path],
        'publishedAt':schema['datePublished'],'updatedAt':schema['dateModified'],
        'author':schema['author']['name'],'category':'Začínáme v autoškole',
        'branch':'strizkov','perex':parser.blocks[0][1],
        'sourceUrl':page['url'],'relatedCourses':['b'],'reviewStatus':'imported',
    }
    # JSON strings are valid YAML scalars; escape Markdown/HTML from plain text.
    frontmatter='\n'.join(key+': '+json.dumps(value,ensure_ascii=False) for key,value in metadata.items())
    paragraphs=[]
    for tag,text in parser.blocks[1:]:
        if 'nejbližšího kurzu' in text:
            text = 'Vyberte si kurz na pobočce Praha 8 – Střížkov.'
        text = text.replace('Psychika je u řízení 90 % úspěchu.', 'Na první jízdu pomůže přijít v klidu.')
        text=text.replace('&','&amp;').replace('<','&lt;').replace('>','&gt;')
        paragraphs.append(('## ' if tag=='h2' else '### ' if tag=='h3' else '')+text)
    (destination/(SELECTED[path]+'.md')).write_text('---\n'+frontmatter+'\n---\n\n'+'\n\n'.join(paragraphs)+'\n',encoding='utf-8')
    print(SELECTED[path],len(parser.blocks),'blocks')

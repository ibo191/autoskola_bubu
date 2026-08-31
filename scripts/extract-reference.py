import base64,gzip,re,json
from pathlib import Path
from pypdf import PdfReader
root=Path(r'C:\Projekty\Onboarding')
s=(root/'app.js').read_text(encoding='utf-8')
m=re.search(r'const payload="([A-Za-z0-9+/=]+)"',s)
assert m, 'Unknown source format'
code=gzip.decompress(base64.b64decode(m.group(1))).decode('utf-8')
Path('tmp/audit/prototype-app.decoded.js').write_text(code,encoding='utf-8')
r=PdfReader(r'C:\Users\jakub\Downloads\logomanual_BUBU.pdf')
Path('tmp/pdfs/brand-text.txt').write_text('\n\n'.join(f'PAGE {i+1}\n{p.extract_text()}' for i,p in enumerate(r.pages)),encoding='utf-8')
print(json.dumps({'decodedBytes':len(code),'decodedLines':len(code.splitlines()),'pdfPages':len(r.pages)}))

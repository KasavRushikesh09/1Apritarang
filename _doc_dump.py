import zipfile, re, sys
from pathlib import Path
p = Path(r'C:\Users\Aniket\Downloads\CRM BRD (internal) - V2, 24th Feb (4).docx')
if not p.exists():
    print('MISSING FILE')
    raise SystemExit(1)
with zipfile.ZipFile(p) as z:
    xml = z.read('word/document.xml').decode('utf-8')
text = re.sub(r'</w:p>', '\n', xml)
text = re.sub(r'<[^>]+>', '', text)
sys.stdout.buffer.write(text.encode('utf-8','ignore'))

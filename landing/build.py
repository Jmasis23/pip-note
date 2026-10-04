from pathlib import Path
import re, shutil, json
import xml.etree.ElementTree as ET
root=Path(__file__).parent
html=(root/'index.html').read_text()
assert '0.2.14' not in html
assert html.count('Free while Pip is in early access.')==2
assert 'nothing leaves' not in html and 'Nothing runs unless you ask' not in html
assert len(re.findall('releases/download/v0.2.21/Pip_0.2.21_x64-setup.exe',html))==3
for name in ['index.html','404.html']:
 s=re.sub(r'<!--.*?-->','',(root/name).read_text(),flags=re.S)
 assert '<title>' in s and 'name="description"' in s
 for src in re.findall(r'(?:src|href|poster)="([^"#]+)"',s):
  if src.startswith(('http','REPLACE')) or src=='/':continue
  assert (root/src.lstrip('/')).is_file(),src
ET.parse(root/'sitemap.xml')
dist=root/'dist'
if dist.exists():shutil.rmtree(dist)
dist.mkdir()
for name in ['index.html','404.html','style.css','main.js','robots.txt','sitemap.xml','_headers','img','fonts']:
 p=root/name
 if p.is_dir():shutil.copytree(p,dist/name)
 else:shutil.copy2(p,dist/name)
print(json.dumps({'build':'pass','version':'0.2.21','files':len(list(dist.rglob('*'))),'output':'dist'}))

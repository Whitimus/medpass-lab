"""Run from any directory: python package_release.py
Builds and verifies the canonical PWA source, standalone HTML, and release ZIP.
"""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
from subprocess import run
from shutil import copyfile
import hashlib
ROOT = Path(__file__).resolve().parent
OUT = ROOT.parent
VERSION = 'v10'
FILES = [
    'README.md','index.html','N1009_MedPass_Lab.html','app.js','data.js',
    'dialog_engine.js','cases.json','styles.css','icon.svg','manifest.webmanifest',
    'release.json','sw.template.js','sw.js','build.js','test_release.js','dialogue_browser.py','package_release.py'
]
run(['node','build.js'], cwd=ROOT, check=True)
run(['node','test_release.js','--browser'], cwd=ROOT, check=True)
run(['node','build.js','--check'], cwd=ROOT, check=True)
standalone = OUT / f'N1009_MedPass_Lab_{VERSION}.html'
copyfile(ROOT / 'N1009_MedPass_Lab.html', standalone)
archive = OUT / f'N1009_MedPass_Lab_PWA_{VERSION}.zip'
with ZipFile(archive,'w',ZIP_DEFLATED,compresslevel=9) as z:
    for file in FILES:
        path=ROOT/file
        assert path.exists(), file
        z.write(path, arcname=file)
with ZipFile(archive) as z:
    assert z.read('N1009_MedPass_Lab.html') == standalone.read_bytes()
    for f in FILES:
        assert z.read(f)==(ROOT/f).read_bytes(),f
print(f'Standalone: {standalone} ({standalone.stat().st_size:,} bytes)')
print(f'PWA bundle: {archive} ({archive.stat().st_size:,} bytes)')
print('SHA256 standalone:',hashlib.sha256(standalone.read_bytes()).hexdigest())

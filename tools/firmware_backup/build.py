from pathlib import Path
import re
from zipfile import ZipFile, ZIP_DEFLATED

root=Path(__file__).resolve().parent
bundle=(root/'vendor/esptool-js-0.7.0.js').read_text()
exports=re.search(r'export\{([^}]+)\};\s*$',bundle)
assert exports
symbols={}
for item in exports.group(1).split(','):
    parts=item.strip().split(' as ')
    symbols[parts[-1]]=parts[0]
vendor='window.AquaBackupVendor=(()=>{'+bundle[:exports.start()]+';return {'+f'ESPLoader:{symbols["ESPLoader"]},Transport:{symbols["Transport"]}'+'};})();'
assert 'import(' not in vendor and 'fetch(' not in vendor
page=(root/'template.html').read_text()
for marker,value in [('VENDOR ESP',vendor),('VENDOR MD5',(root/'vendor/spark-md5-3.0.2.js').read_text()),('CORE',(root/'core.js').read_text()),('UI',(root/'ui.js').read_text())]:
    page=page.replace('/* '+marker+' */',re.sub(r'</script',r'<\/script',value,flags=re.I))
assert not re.search(r'/\* (VENDOR|CORE|UI)',page)
target=root/'AquaControl-Firmware-Backup.html';target.write_text(page)
with ZipFile(root/'AquaControl-Firmware-Backup-v1.0.zip','w',ZIP_DEFLATED) as z:
    z.write(target,target.name)
    z.write(root/'README.txt','README.txt')
    for notice in sorted((root/'vendor').iterdir()):
        if 'LICENSE' in notice.name:
            z.write(notice,'licenses/'+notice.name)
    z.write(root/'vendor/sources.json','licenses/sources.json')
print('Built offline ESP32 backup HTML and ZIP with bundled libraries/licenses.')

from pathlib import Path
import argparse,base64,hashlib,json,re,shutil,struct
from zipfile import ZipFile,ZIP_DEFLATED

root=Path(__file__).resolve().parent
parser=argparse.ArgumentParser()
parser.add_argument('--firmware',required=True,type=Path)
parser.add_argument('--backup',required=True,type=Path)
args=parser.parse_args()
original=args.backup.read_bytes();firmware=args.firmware.read_bytes()
assert len(original)==4194304
assert hashlib.sha256(original).hexdigest()=='fa6ad0beadf2dae49b37f7a02ea9d80bf98490e1f4ca26a88ed47e71973b3a83'
def image_end(data,base=0):
    assert data[base]==0xe9
    position=base+24;checksum=0xef
    for _ in range(data[base+1]):
        _,size=struct.unpack_from('<II',data,position);position+=8
        for value in data[position:position+size]:checksum^=value
        position+=size
    checksum_position=position+15-((position-base)%16)
    assert data[checksum_position]==checksum
    assert data[base+23]==1
    assert hashlib.sha256(data[base:checksum_position+1]).digest()==data[checksum_position+1:checksum_position+33]
    return checksum_position+33
original_app=original[0x10000:image_end(original,0x10000)]
assert image_end(firmware)==len(firmware)
marker=b'AQUA_A_PEER_V1'+bytes(32-len('AQUA_A_PEER_V1'))
assert firmware.count(marker)==1
offset=firmware.index(marker);assert firmware[offset+32:offset+40]==bytes(8)
manifest={'backupSha256':hashlib.sha256(original).hexdigest(),'originalAppSha256':hashlib.sha256(original_app).hexdigest(),'originalAppMd5':hashlib.md5(original_app).hexdigest(),'templateSha256':hashlib.sha256(firmware).hexdigest(),'peerConfigOffset':offset,'originalPeerOffset':0x25730}
(root/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
shutil.copyfile(args.firmware,root/'firmware-template.bin')
vendor=root.parent/'firmware_backup/vendor'
bundle=(vendor/'esptool-js-0.7.0.js').read_text();exports=re.search(r'export\{([^}]+)\};\s*$',bundle);assert exports
symbols={parts[-1]:parts[0] for item in exports.group(1).split(',') for parts in [item.strip().split(' as ')]}
esp='window.AquaBackupVendor=(()=>{'+bundle[:exports.start()]+';return {'+f'ESPLoader:{symbols["ESPLoader"]},Transport:{symbols["Transport"]}'+'};})();'
assert 'import(' not in esp and 'fetch(' not in esp
constants='const AQUARIUM_MANIFEST='+json.dumps(manifest)+';\nconst AQUARIUM_IMAGE_BASE64='+json.dumps(base64.b64encode(firmware).decode())+';'
page=(root/'template.html').read_text()
for name,source in [('VENDOR ESP',esp),('VENDOR MD5',(vendor/'spark-md5-3.0.2.js').read_text()),('MANIFEST',constants),('CORE',(root/'core.js').read_text()),('UI',(root/'ui.js').read_text())]:
    page=page.replace('/* '+name+' */',re.sub(r'</script',r'<\/script',source,flags=re.I))
assert not re.search(r'/\* (VENDOR|MANIFEST|CORE|UI)',page)
(root/'Aquarium-B-Circulation-Update.html').write_text(page)
with ZipFile(root/'Aquarium-B-Circulation-Update-v1.0.zip','w',ZIP_DEFLATED) as z:
    for name in ['Aquarium-B-Circulation-Update.html','README.txt']:z.write(root/name,name)
    for notice in sorted(vendor.iterdir()):
        if 'LICENSE' in notice.name:z.write(notice,'licenses/'+notice.name)
    z.write(vendor/'sources.json','licenses/sources.json')
print('Built matched-backup updater, firmware template and licenses. No original backup or device MAC included.')

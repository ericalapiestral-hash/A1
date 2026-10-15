"""Build offline heater updater from public templates and a local private backup."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import argparse,base64,hashlib,json,re,struct

root=Path(__file__).resolve().parent
parser=argparse.ArgumentParser();parser.add_argument('--firmware',required=True,type=Path);parser.add_argument('--backup',required=True,type=Path)
args=parser.parse_args();backup=args.backup.read_bytes();firmware=args.firmware.read_bytes()
assert len(backup)==4194304 and hashlib.sha256(backup).hexdigest()=='fa6ad0beadf2dae49b37f7a02ea9d80bf98490e1f4ca26a88ed47e71973b3a83'
def end(data,base=0):
    assert data[base]==0xe9 and data[base+23]==1
    p=base+24;checksum=0xef
    for _ in range(data[base+1]):
        _,n=struct.unpack_from('<II',data,p);p+=8
        for b in data[p:p+n]:checksum^=b
        p+=n
    c=p+15-((p-base)%16);assert data[c]==checksum
    assert hashlib.sha256(data[base:c+1]).digest()==data[c+1:c+33]
    return c+33
assert end(firmware)==len(firmware)
marker=b'AQUA_A_PEER_V1'+bytes(19);assert firmware.count(marker)==1
offset=firmware.index(marker);assert firmware[offset+32:offset+40]==bytes(8)
original=backup[0x10000:end(backup,0x10000)]
old=root.parent/'aquarium_update'
prior=[];prior_meta=[]
for name,path,meta_path,expected,supply in [
    ('1.1.0',old/'firmware-template.bin',old/'manifest.json','61d5ccd7879d99c53594e007b8a5a0e5b70c76b8d6368783fc740d0beec07001',True),
    ('1.0.1',old/'previous/firmware-v1.0.1.bin',old/'previous/manifest-v1.0.1.json','5cc3e840ea258f5955f4f8ea67d706cd66cb71b52ab1347d22b471c8e56294ef',False)]:
    data=path.read_bytes();meta=json.loads(meta_path.read_text())
    assert hashlib.sha256(data).hexdigest()==expected==meta['templateSha256'] and end(data)==len(data)
    prior.append(base64.b64encode(data).decode())
    prior_meta.append(dict(version=name,templateSha256=expected,peerConfigOffset=meta['peerConfigOffset'],manualSupply=supply))
manifest=dict(version='1.2.0',backupSha256=hashlib.sha256(backup).hexdigest(),originalAppSha256=hashlib.sha256(original).hexdigest(),originalAppMd5=hashlib.md5(original).hexdigest(),templateSha256=hashlib.sha256(firmware).hexdigest(),peerConfigOffset=offset,originalPeerOffset=0x25730,manualSupply=True,manualHeater=True,previousTemplates=prior_meta)
(root/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n');(root/'firmware-template.bin').write_bytes(firmware)
vendor=root.parent/'firmware_backup/vendor';bundle=(vendor/'esptool-js-0.7.0.js').read_text();exports=re.search(r'export\{([^}]+)\};\s*$',bundle);assert exports
symbols={p[-1]:p[0] for item in exports.group(1).split(',') for p in [item.strip().split(' as ')]}
esp='window.AquaBackupVendor=(()=>{'+bundle[:exports.start()]+';return {'+f'ESPLoader:{symbols["ESPLoader"]},Transport:{symbols["Transport"]}'+'};})();'
assert 'import(' not in esp and 'fetch(' not in esp
constants='const AQUARIUM_MANIFEST='+json.dumps(manifest)+';\nconst AQUARIUM_IMAGE_BASE64='+json.dumps(base64.b64encode(firmware).decode())+';\nconst AQUARIUM_PREVIOUS_BASE64='+json.dumps(prior)+';'
page=(root/'template.html').read_text()
for name,source in [('VENDOR ESP',esp),('VENDOR MD5',(vendor/'spark-md5-3.0.2.js').read_text()),('MANIFEST',constants),('CORE',(root/'core.js').read_text()),('UI',(root/'ui.js').read_text())]:page=page.replace('/* '+name+' */',re.sub(r'</script',r'<\/script',source,flags=re.I))
assert not re.search(r'/\* (VENDOR|MANIFEST|CORE|UI)',page)
(root/'Aquarium-B-Heater-Update.html').write_text(page)
with ZipFile(root/'Aquarium-B-Heater-Update-v1.2.1.zip','w',ZIP_DEFLATED) as z:
    for name in ['Aquarium-B-Heater-Update.html','Heater-Relay-Check.html','README.txt','Relay-Check-README.txt']:z.write(root/name,name)
    for p in sorted(vendor.iterdir()):
        if 'LICENSE' in p.name:z.write(p,'licenses/'+p.name)
    z.write(vendor/'sources.json','licenses/sources.json')
    for p in sorted((old/'licenses').iterdir()):z.write(p,'licenses/firmware/'+p.name)
with ZipFile(root/'Heater-Relay-Check-v1.2.1.zip','w',ZIP_DEFLATED) as z:
    for name in ['Heater-Relay-Check.html','Relay-Check-README.txt']:z.write(root/name,name)
print('Built tool package v1.2.1 and standalone relay checker. Firmware remains v1.2.0; no original backup/device MAC distributed.')

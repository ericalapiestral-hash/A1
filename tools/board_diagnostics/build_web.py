from pathlib import Path

root = Path(__file__).resolve().parent
template = (root / 'web/template.html').read_text()
page = template.replace('/* CORE */', (root / 'web/core.js').read_text()).replace(
    '/* UI */', (root / 'web/ui.js').read_text())
assert '/* CORE */' not in page and '/* UI */' not in page
target = root.parents[1] / 'docs/board-diagnostics'
target.mkdir(parents=True, exist_ok=True)
(target / 'index.html').write_text(page)
(root / 'AquaControl-Board-Diagnostics.html').write_text(page)
print('Built self-contained offline HTML and GitHub Pages entry.')

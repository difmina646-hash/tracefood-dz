#!/usr/bin/env python3
"""Verifies that EVERY API call made by the React client (method + path) exists as a real Express route in server/src.
Also writes docs/ROUTES.txt. Exit code 1 if any client call has no matching server route."""
import re, glob, os, sys, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
BASE = {'auth': '/auth', 'admin': '/admin', 'public': '/public'}
routes = set()
def norm(path): return re.sub(r':\w+|\$\{[^}]*\}', ':p', path.split('?')[0]).rstrip('/') or '/'
for f in sorted(glob.glob(str(root / 'server/src/modules/*.ts'))):
    name = os.path.basename(f)[:-3]; s = open(f).read(); prefix = BASE.get(name, '')
    for m in re.finditer(r"(?:Router|router)\.(get|post|put|patch|delete)\(\s*(?:`([^`]+)`|'([^']+)')", s):
        routes.add((m.group(1).upper(), norm(prefix + (m.group(2) or m.group(3)))))
    if name == 'master':
        for m in re.finditer(r"crud\('(/[\w-]+)'", s):
            for meth, sfx in [('GET', ''), ('GET', '/:id'), ('POST', ''), ('PUT', '/:id')]: routes.add((meth, norm(m.group(1) + sfx)))
    if name == 'inventory':
        for m in re.finditer(r"exitRoute\('(/[\w/-]+)'", s): routes.add(('POST', norm(m.group(1))))
    if name == 'incidents':
        for p in ('corrective-actions', 'preventive-actions'): routes.add(('POST', f'/incidents/:p/{p}')); routes.add(('PATCH', f'/incidents/:p/{p}/:p'))
(root / 'docs/ROUTES.txt').write_text('\n'.join(f'{m:6} /api{p}' for m, p in sorted(routes, key=lambda x: (x[1], x[0]))))
first = {p.split('/')[1] for _, p in routes}
def match(meth, path):
    cs = path.strip('/').split('/')
    for m, p in routes:
        if m != meth: continue
        ss = p.strip('/').split('/')
        if len(ss) == len(cs) and all(a == b or a == ':p' or b == ':p' for a, b in zip(ss, cs)): return True
    return False
calls = []
CALL = re.compile(r"(api\.(get|post|put|patch|del|upload|blobUrl|download)|useApi|usePaged)\s*(?:<[^>()]*(?:<[^>()]*>)?[^>()]*>)?\(\s*([`'\"])(/[^`'\"]*)\3")
for f in glob.glob(str(root / 'client/src/**/*.ts*'), recursive=True):
    s = open(f).read(); rel = os.path.relpath(f, root / 'client/src')
    for m in CALL.finditer(s):
        fn = m.group(2) or 'get'
        meth = {'get': 'GET', 'post': 'POST', 'put': 'PUT', 'patch': 'PATCH', 'del': 'DELETE', 'upload': 'POST', 'blobUrl': 'GET', 'download': 'GET'}.get(fn, 'GET')
        calls.append((rel, meth, norm(m.group(4))))
    for m in re.finditer(r"(?:\? |= |: )([`'\"])(/(?:trace|admin|public|auth|incidents|shipments)/[^`'\"]*)\1", s):   # paths held in variables (ternaries)
        calls.append((rel, 'GET', norm(m.group(2))))
    for m in re.finditer(r"<CrudPage[\s\S]{0,600}?\bpath=\"(/[\w-]+)\"", s):                                                # <CrudPage path=...>
        for meth, sfx in [('GET', ''), ('POST', ''), ('PUT', '/:p')]: calls.append((rel, meth, norm(m.group(1) + sfx)))
    for m in re.finditer(r"api\.(post|get|patch|put)\(`(/[^`]*)`\s*[,)]", s): pass
bad = sorted({c for c in calls if not match(c[1], c[2])})
uniq = {(m, p) for _, m, p in calls}
print(f'server routes: {len(routes)} | distinct client calls: {len(uniq)} | client calls with NO server route: {len(bad)}')
for f, m, p in bad: print(f'  ✗ {m:6} {p}   ({f})')
used = {r for r in routes if any(r[0] == m and match(m, r[1]) and all(a == b or a == ':p' or b == ':p' for a, b in zip(r[1].strip('/').split('/'), p.strip('/').split('/'))) and len(r[1].strip('/').split('/')) == len(p.strip('/').split('/')) for m, p in uniq)}
print(f'server routes used by the UI: {len(used)}/{len(routes)}')
for m, p in sorted(routes - used, key=lambda x: x[1]): print(f'  (not used by UI) {m:6} {p}')
sys.exit(1 if bad else 0)

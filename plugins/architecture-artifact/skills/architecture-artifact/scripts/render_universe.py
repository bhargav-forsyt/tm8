#!/usr/bin/env python3
"""Render the one architecture artifact: system HLD -> module HLD -> submodule HLD.

All layouts come from authored lanes, never inferred graph edges. A legacy node/edge
graph, when present, is retained as an evidence archive.

    python3 render_universe.py [out.html] [--universe path/to/universe.json]

The authoring directory (universe.json + architecture.config.json) is resolved by
arch_config; nothing about any one project lives in this file.
"""
from __future__ import annotations
import json,pathlib,sys,re
import arch_config
from render_common import esc, find_repo, KIND_COLOR, RESOURCE_LABELS, RESOURCE_SHAPES, REL_STYLE, resource_icon
from validate_universe import validate
ROOT=pathlib.Path(__file__).resolve().parent
HLD_SCHEMA='architecture.hld.v1'
# Step vocabulary. IMPORTED from render_common so the task and universe renderers cannot drift:
# resourceType picks the symbol, kind picks the colour. Independent axes, both optional.
RESOURCE_TYPES=tuple(RESOURCE_SHAPES)
STEP_KINDS=tuple(KIND_COLOR)

def validate_hlds(data,repo):
    assert data.get('hldSchema')==HLD_SCHEMA,f'hldSchema must be {HLD_SCHEMA!r}, got {data.get("hldSchema")!r}'
    hs=data.get('hlds');assert isinstance(hs,list) and hs,'HLDs must be a nonempty list'
    ids=[h['id'] for h in hs];assert len(ids)==len(set(ids)),'Duplicate HLD IDs'
    by={h['id']:h for h in hs};legacy={n['id'] for n in (data.get('nodes') or [])}
    aliases=data.get('sceneAliases',{})
    assert isinstance(aliases,dict),'sceneAliases must map retired IDs directly to existing HLD IDs'
    for retired,target in aliases.items():
        assert isinstance(retired,str) and retired and retired not in by and retired not in legacy and retired!='plane-map','Alias shadows a live scene'
        assert isinstance(target,str) and target in by,'Alias must point directly to an existing HLD'
    assert 'root' in by and by['root']['parent'] is None,'System HLD must be root'
    refs=[]
    def text(x,limit,ctx):
        assert isinstance(x,str) and x.strip(),f'{ctx}: missing text'
        assert len(x)<=limit,f'{ctx}: {len(x)} characters > {limit}: {x}'
    def evidence(items,ctx):
        for e in items:
            p=repo/e['file'];assert not pathlib.Path(e['file']).is_absolute(),f'{ctx}: absolute ref'
            assert p.is_file(),f'{ctx}: missing {p}'
            assert isinstance(e['line'],int) and 1<=e['line']<=len(p.read_bytes().splitlines()),f'{ctx}: invalid line {e}'
            refs.append(f"{e['file']}:{e['line']}")
    for h in hs:
        text(h['title'],60,h['id']);text(h['summary'],140,h['id'])
        assert h['id']=='root' or h['parent'] in by,f'{h["id"]}: unknown parent'
        seen=set();c=h
        while c['parent'] is not None:
            assert c['id'] not in seen,'HLD containment cycle';seen.add(c['id']);c=by[c['parent']]
        assert c['id']=='root','HLD disconnected from system'
        assert h.get('inputs') and h.get('outputs'),f'{h["id"]}: responsibility boundary missing'
        assert h.get('provenance',{}).get('verifiedAgainstCode'),f'{h["id"]}: provenance missing'
        for c in h.get('corrections',[]):
            assert all(isinstance(c.get(k),str) and c[k].strip() for k in ['date','task','was','now','why']),f'{h["id"]}: incomplete correction'
        if 'resourceType' in h:assert h['resourceType'] in RESOURCE_TYPES,f"{h['id']}: unknown resourceType {h['resourceType']!r}; allowed {RESOURCE_TYPES}"
        if 'kind' in h:assert h['kind'] in STEP_KINDS,f"{h['id']}: unknown kind {h['kind']!r}; allowed {STEP_KINDS}"
        if 'shallow' in h:assert isinstance(h['shallow'],bool),f"{h['id']}: shallow must be true/false, got {h['shallow']!r}"
        assert all(s in legacy for s in h.get('sourceIds',[])),f'{h["id"]}: unknown archive source'
        evidence(h.get('evidence',[]),h['id'])
        assert h.get('lanes'),f'{h["id"]}: no flow'
        for lane in h['lanes']:
            assert lane['kind'] in ['main','failure','recovery'],'Unknown lane type'
            text(lane['label'],60,h['id']);assert 1<=len(lane['steps'])<=5,'Use 1–5 steps per lane'
            for s in lane['steps']:
                text(s['title'],60,h['id']);text(s['summary'],95,h['id'])
                assert not s.get('open') or s['open'] in by,f'{h["id"]}: broken link {s.get("open")}'
                details=s.get('detail',[]);assert isinstance(details,list) and len(details)<=5,'Detail must be <=5 bullets'
                for bullet in details:text(bullet,95,h['id'])
                if 'resourceType' in s:assert s['resourceType'] in RESOURCE_TYPES,f"{h['id']}: unknown resourceType {s['resourceType']!r} on step {s['title']!r}; allowed {RESOURCE_TYPES}"
                if 'shallow' in s:assert isinstance(s['shallow'],bool),f"{h['id']}: shallow must be true/false on step {s['title']!r}, got {s['shallow']!r}"
                if 'kind' in s:assert s['kind'] in STEP_KINDS,f"{h['id']}: unknown kind {s['kind']!r} on step {s['title']!r}; allowed {STEP_KINDS}"
                evidence(s.get('evidence',[]),h['id'])
    # moduleEdges: authored cross-HLD topology (session B). Same relations the legacy graph uses.
    for e in data.get('moduleEdges',[]):
        assert e.get('from') in by and e.get('to') in by,f'moduleEdge {e}: from/to must be HLD ids'
        assert e['from']!=e['to'],f'moduleEdge {e}: self-edge'
        assert e.get('rel') in REL_STYLE,f"moduleEdge {e}: unknown rel; allowed {tuple(REL_STYLE)}"
        if 'label' in e:text(e['label'],40,f'moduleEdge {e["from"]}->{e["to"]}')
        evidence(e.get('evidence',[]),f'moduleEdge {e["from"]}->{e["to"]}')
    return refs

def render(data,repo,out):
    legacy_refs=validate(data,repo);refs=validate_hlds(data,repo)
    tpl=(ROOT/'universe_page.template.html').read_text()
    assert '{{DATA}}' in tpl,'Missing data placeholder'
    assert '{{VOCAB}}' in tpl,'Missing vocabulary placeholder'
    def js(obj):return json.dumps(obj,ensure_ascii=True,separators=(',',':')).replace('<','\\u003c').replace('>','\\u003e').replace('&','\\u0026')
    vocab=dict(resources={r:resource_icon(r) for r in RESOURCE_TYPES},resourceLabels=RESOURCE_LABELS,kinds=KIND_COLOR)
    cfg,_=arch_config.load_config(out.parent)
    title=data.get('title') or 'Architecture'
    brand=cfg.get('brand') or data.get('brand') or title
    html=(tpl.replace('{{DATA}}',js(data)).replace('{{VOCAB}}',js(vocab))
             .replace('{{TITLE}}',esc(title)).replace('{{BRAND}}',esc(brand)))
    for placeholder in ('{{DATA}}','{{VOCAB}}','{{TITLE}}','{{BRAND}}'):
        assert placeholder not in html,f'{placeholder} survived the render'
    out.write_text(html)
    print(f'Rendered {len(data["hlds"])} HLDs; {len(refs)} HLD refs and {len(legacy_refs)} archive refs checked; {len(data.get("moduleEdges",[]))} authored module edges.')
    return dict(hlds=len(data['hlds']),hldRefs=len(refs),archiveRefs=len(legacy_refs))
def main(argv:list[str])->None:
    args=[a for a in argv if a!='--universe'];explicit=None
    if '--universe' in argv:
        i=argv.index('--universe');explicit=argv[i+1];args=[a for a in argv if a not in ('--universe',explicit)]
    src=pathlib.Path(explicit).expanduser() if explicit else arch_config.find_authoring_dir()/'universe.json'
    assert src.is_file(),f'no universe.json at {src} — set $ARCHITECTURE_DIR or pass --universe'
    out=pathlib.Path(args[0]).expanduser() if args else src.parent/'index.html'
    repo=find_repo(src.parent)
    assert repo,('no source checkout resolved. Set $ARCHITECTURE_REPO, set "repo" in '
                 'architecture.config.json, or run from inside the checkout.')
    render(json.loads(src.read_text()),repo,out)

if __name__=='__main__':
    main(sys.argv[1:])

"""Read-only, exact-DOCX repairs for the 136 prescription guides in chapters 6–10.

Keeps CMS document/item identities and review status. Never contacts the CMS.
Alignment is exact (not fuzzy); known split-import artifacts are asserted below.
All source paragraphs must be accounted for in their original order.
"""
import copy
import hashlib
import json
import re
import unicodedata
from collections import Counter
from docx import Document
from docx.oxml.ns import qn
from docx.text.paragraph import Paragraph

SOURCE_ID = '119EyMzSHYV2SVYXLo6_P2EgkI_8Hukw_uNDvGuewyNg'
EXPECTED = {6:25, 7:21, 8:37, 9:21, 10:32}
# These fragments were incorrectly promoted to separate items by the old import.
FRAGMENTS = {
 (6,15): {'b2':'mg'},
 (6,23): {'b2':'muaj në kontekstin e përshkruar.'},
 (7,10): {'b10':'sekonda) deri në dalje.'},
 (7,12): {'b8':'mg nga goja çdo ditë, me rritje në intervale 1-4 javë.'},
 (7,21): {'b9':'Patisiran; dozat nuk jepen këtu.'},
 (8,3): {'b7':'minuta pas aplikimit. Burimi nuk jep fortësinë.'},
 (9,8): {'b4':'ESTERS'},
 (9,20): {'b3':'DHE'},
 (10,3): {'b2':'njësi para drekës dhe 6-8 njësi para darkës. Kjo mospërputhje është ruajtur pa u korrigjuar në heshtje.'},
 (10,4): {'b5':'javë; mund të rritet në 1 mg dhe më pas 2 mg një herë në javë sipas përgjigjes.'},
 (10,9): {'b11':'muajve, 60 mg BD.'},
 (10,17): {'b5':'muaj. Maksimumi: 14 mg/ditë.'},
}
TITLE_FIXES = {
 (6,15,'b1'):'Tab. Rifampicin 150 mg + Isoniazid 75 mg + Ethambutol 275 mg + Pyrazinamide 400 mg',
 (7,20,'b7'):'DISOPYRAMIDE 100 mg',
 (9,6,'b5'):'ALTERNATIVË E PËRMENDUR NË TABELË – SOFOSBUVIR + VELPATASVIR + VOXILAPREVIR',
 (9,8,'b3'):'SHËNIM I BURIMIT – ALTERNATIVË – SOFTGEL CAP. OMEGA-3-ACID ETHYL ESTERS',
}
MISSING_ITEMS = {
 (6,25): [
  ('N-Acetylcysteine 200 mg sachet','or','active-substance','N-Acetylcysteine','Sachet','200 mg'),
  ('SHËNIM I BURIMIT – SYP. CARBOCISTEINE 250 mg/5 mL','or','source-note','','',''),
  ('Inh. Salbutamol','and','active-substance','Salbutamol','Inh.',''),
  ('Inh. Ipratropium bromide','or','active-substance','Ipratropium bromide','Inh.',''),
  ('Tab. Azithromycin 500 mg','conditional','active-substance','Azithromycin','Tab.','500 mg'),
  ('Cap. Azithromycin 250 mg','or','active-substance','Azithromycin','Cap.','250 mg'),
  ('Inh. Gentamicin 80 mg','or','active-substance','Gentamicin','Inh.','80 mg'),
  ('Inh. Tobramycin 300 mg','or','active-substance','Tobramycin','Inh.','300 mg'),
  ('SHËNIM I BURIMIT – MACROLIDE','conditional','source-note','','',''),
 ],
 (8,37): [
  ('Inj. Ketorolac 30 mg','and','active-substance','Ketorolac','Inj.','30 mg'),
  ('Enema. Sodium biphosphate 19.2 g + Sodium phosphate 7.2 g','and','active-substance','Sodium biphosphate + Sodium phosphate','Enema','19.2 g + 7.2 g'),
 ],
}

def clean_title(value):
    value = value.strip()
    if value.startswith('🔟'):
        value = value[1:].lstrip()
    return re.sub(r'^(?:\d\ufe0f?\u20e3)+\s*', '', value).strip()

def normalized(value):
    return re.sub(r'[^\w<>≤≥]+', '', unicodedata.normalize('NFKC', clean_title(value)).casefold())

def source_sections(source_path, expected=None, embedded_headings=None):
    expected = EXPECTED if expected is None else expected
    embedded_headings = embedded_headings or {}
    embedded_seen = Counter()
    doc = Document(source_path)
    sections, chapter, current = [], 0, None
    for index, element in enumerate(doc.element.body):
        if element.tag == qn('w:p'):
            p = Paragraph(element, doc)
            value = p.text.strip()
            if p.style.name == 'Heading 2' and (match := re.match(r'KAPITULLI\s+(\d+)', value)):
                chapter, current = int(match[1]), None
            if chapter not in expected:
                continue
            assert not p._p.xpath('.//w:drawing | .//w:pict | .//m:oMath'), 'Unsupported rich source structure'
            embedded = p.style.name == 'Heading 4' and (chapter,value) in embedded_headings
            if embedded:
                embedded_seen[(chapter,value)] += 1
            if p.style.name == 'Heading 4' and not embedded:
                current = {'chapter':chapter, 'title':value, 'paragraphs':[]}
                sections.append(current)
            elif current and value:
                current['paragraphs'].append({'index':index, 'text':value})
        elif element.tag == qn('w:tbl') and chapter in expected:
            raise AssertionError('Prescription tables require a rich table conversion')
    assert Counter(s['chapter'] for s in sections) == expected
    assert embedded_seen == embedded_headings, 'Embedded source heading structure changed'
    return sections

def connector(prelude, old, overrides=None):
    if not prelude:
        return {'condition':'', 'sourceConnectorLabel':'' if old['relation']=='start' else old.get('sourceConnectorLabel','')}
    raw = '\n\n'.join(prelude)
    if overrides and raw in overrides:
        return copy.deepcopy(overrides[raw])
    if raw == 'PASTAJ':
        return {'sourceConnectorLabel':'PASTAJ', 'condition':'', 'relation':'and', 'selection':'all'}
    match = re.match(r'^(DHE/OSE|OSE|DHE|PLUS|NËSE|PËR|KUR)(?=\b|[, :])[, :]*', raw)
    if match:
        relation={'OSE':'or','DHE':'and','PLUS':'plus','NËSE':'conditional','PËR':'conditional','KUR':'conditional'}.get(match[1],old['relation'])
        fields={'sourceConnectorLabel':match[1], 'condition':raw[match.end():].strip(), 'relation':relation}
        fields['selection']='choose-one' if relation=='or' else 'all'
        return fields
    label=old.get('sourceConnectorLabel','')
    if label==raw or label.rstrip(':')==raw.rstrip(':'):
        label=''
    return {'sourceConnectorLabel':label, 'condition':raw}

def build(source_path, existing, source_document_id=SOURCE_ID, profile=None):
    profile = profile or {}
    expected = profile.get('expected',EXPECTED)
    fragments = profile.get('fragments',FRAGMENTS)
    title_fixes = profile.get('title_fixes',TITLE_FIXES)
    missing_items = profile.get('missing_items',MISSING_ITEMS)
    assert source_document_id == SOURCE_ID, 'Use the canonical prescription document'
    assert len(existing) == sum(expected.values()) and len({g['_id'] for g in existing}) == len(existing)
    assert Counter(g['chapterNumber'] for g in existing) == expected
    sections = source_sections(source_path,expected,profile.get('embedded_headings'))
    by_chapter = {c:[s for s in sections if s['chapter']==c] for c in expected}
    corrected, changes, coverage = [], [], []
    for original in existing:
        guide = copy.deepcopy(original)
        chapter, order = guide['chapterNumber'], guide['orderInChapter']
        section = by_chapter[chapter][order-1]
        # Only two headings have displaced comparison signs; their words/order agree.
        assert normalized(guide['sourceHeading']).replace('≤','').replace('≥','') == normalized(section['title']).replace('≤','').replace('≥',''), guide['sourceHeading']
        guide['title'] = guide['sourceHeading'] = section['title']
        paragraphs = [p['text'] for p in section['paragraphs'] if p['text'] != 'Rx']
        blocks, anchors, used = [], [], set()
        for old in original['logicBlocks']:
            assert len(old.get('items',[])) == 1, 'Unexpected multi-item source block'
            item = old['items'][0]
            artifact = fragments.get((chapter,order),{}).get(old['_key'])
            if artifact is not None:
                assert item['title'] == artifact, 'Split artifact changed'
                continue
            title = title_fixes.get((chapter,order,old['_key']),item['title'])
            matches = [i for i,p in enumerate(paragraphs) if normalized(p)==normalized(title) and i not in used and (not anchors or i>anchors[-1])]
            synthetic = item['title'] == 'Shënim i burimit'
            if synthetic:
                assert not matches and not blocks, f'Unexpected introductory note: {chapter}.{order}'
                intro = next(j for j,p in enumerate(paragraphs) if p.startswith('S. '))
                assert normalized(item.get('sig','')).startswith(normalized(paragraphs[intro][3:])[:30]), 'Introductory note differs'
                matches = [intro]
            assert matches, f'Exact title alignment failed: {chapter}.{order}/{old["_key"]}: {title}'
            anchor = matches[0]
            assert not anchors or anchor > anchors[-1], 'Source block order changed'
            used.add(anchor)
            block = copy.deepcopy(old)
            if not synthetic:
                block['items'][0]['title'] = clean_title(paragraphs[anchor])
            blocks.append(block)
            anchors.append(anchor)
        for title,relation,kind,generic,form,strength in missing_items.get((chapter,order),[]):
            matches=[i for i,p in enumerate(paragraphs) if normalized(p)==normalized(title)]
            assert len(matches)==1, f'Missing-item source changed: {title}'
            anchor=matches[0]
            if anchor in used:
                continue
            key='source-'+str(section['paragraphs'][anchor+1]['index'])
            item={'_key':key+'-item','_type':'sourcePrescriptionItem','kind':kind,'title':clean_title(paragraphs[anchor])}
            if generic:item.update(genericName=generic,form=form,strength=strength)
            number=re.match(r'^((?:\d\ufe0f?\u20e3)+)',paragraphs[anchor])
            if number:item['sourceNumber']=int(re.sub(r'\D','',number[1]))
            block={'_key':key,'_type':'prescriptionLogicBlock','relation':relation,'sourceConnectorLabel':{'or':'OSE','and':'DHE','conditional':'NËSE'}[relation],'selection':'choose-one' if relation=='or' else 'all','items':[item]}
            blocks.append(block);anchors.append(anchor);used.add(anchor)
        ordered=sorted(zip(anchors,blocks),key=lambda pair:pair[0])
        anchors,blocks=[a for a,b in ordered],[b for a,b in ordered]
        consumed, pending = [], paragraphs[:anchors[0]]
        for i,(block,anchor) in enumerate(zip(blocks,anchors)):
            synthetic = block['items'][0]['title']=='Shënim i burimit'
            end = anchors[i+1] if i+1<len(anchors) else len(paragraphs)
            block.update(connector(pending,block,profile.get('connector_overrides')))
            consumed.extend(pending)
            if not synthetic:
                consumed.append(paragraphs[anchor])
            body = paragraphs[anchor if synthetic else anchor+1:end]
            sig_indexes = [j for j,p in enumerate(body) if p.startswith('S. ')]
            if sig_indexes:
                assert sig_indexes[0]==0, f'Unexpected content before signatura: {chapter}.{order}/{block["_key"]}'
                last = sig_indexes[-1]
                block['items'][0]['sig'] = body[0][3:]
                notes = body[1:last+1]
                consumed.extend(body[:last+1])
                pending = body[last+1:]
                if notes:
                    block['note'] = '\n\n'.join(notes)
                else:
                    block.pop('note',None)
            else:
                assert not block['items'][0].get('sig'), 'Missing source signatura'
                pending = body
            block['order'] = i+1
            block['items'][0]['order'] = i+1
        if pending:
            blocks[-1]['note'] = '\n\n'.join(filter(None,[blocks[-1].get('note',''),*pending]))
            consumed.extend(pending)
        assert consumed == paragraphs, f'Source paragraphs omitted/reordered: {chapter}.{order}'
        # Restore the one split combination title's parsed fields as well.
        if (chapter,order)==(6,15):
            blocks[0]['items'][0].update(genericName='Rifampicin + Isoniazid + Ethambutol + Pyrazinamide',strength='150 mg + 75 mg + 275 mg + 400 mg')
        guide['logicBlocks'] = blocks
        assert guide['_id']==original['_id'] and guide['reviewStatus']==original['reviewStatus']
        corrected.append(guide)
        coverage.append({'chapter':chapter,'order':order,'guideId':guide['_id'],'paragraphs':len(paragraphs),'sourceSequenceSha256':hashlib.sha256(json.dumps(paragraphs,ensure_ascii=False).encode()).hexdigest()})
        fields = {k:guide[k] for k in ('title','sourceHeading','logicBlocks') if guide[k]!=original[k]}
        if fields:
            changes.append({'id':guide['_id'],'ifRevisionId':original['_rev'],'set':fields,'rollback':{k:original[k] for k in fields}})
    return {'sourceDocumentId':SOURCE_ID,'sourceSha256':hashlib.sha256(open(source_path,'rb').read()).hexdigest(),'counts':{'guidesCompared':len(existing),'changedGuides':len(changes),'paragraphs':sum(c['paragraphs'] for c in coverage),'removedSplitArtifacts':sum(len(v) for v in fragments.values())},'changes':changes,'coverage':coverage,'correctedGuides':corrected}

if __name__=='__main__':
    import argparse
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source');parser.add_argument('existing');parser.add_argument('output')
    parser.add_argument('--source-document-id',default=SOURCE_ID)
    args=parser.parse_args()
    result=build(args.source,json.load(open(args.existing,encoding='utf-8')),args.source_document_id)
    with open(args.output,'w',encoding='utf-8') as out:json.dump(result,out,ensure_ascii=False,indent=2)
    print(json.dumps(result['counts']))

"""Read-only, source-asserted repairs for chapters 15–20 and three missing references."""
import copy
import importlib.util
import json
import re
from pathlib import Path

s=importlib.util.spec_from_file_location('prescription_engine',Path(__file__).with_name('repair-prescription-chapters-6-10.py'))
engine=importlib.util.module_from_spec(s);s.loader.exec_module(engine)
SOURCE_ID=engine.SOURCE_ID
EXPECTED={15:24,16:44,17:14,18:15,19:26,20:17}
FRAGMENTS={
 (16,1):{'b2':'ditësh nëse ka prova për marimanga të gjalla.'},
 (16,15):{'b2':'javë.','b4':'ditë. Për thonjtë e këmbëve: 200 mg, OD, për 12 javë rresht.'},
 (16,38):{'b3':'orët e para. Gjysma jepet në 8 orët e para dhe gjysma tjetër gjatë 16 orëve pasuese.','b4':'orë terapi fillestare me lëngje, pasuar nga 24 orë maintenance fluid therapy me solucion që përmban glucose.'},
 (16,41):{'b9':'SJS/TEN.'},
 (18,13):{'b3':'minutave OSE derisa pH të normalizohet/ri-vendoset; pacienti këshillohet të fillojë irrigimin për të paktën 15 minuta para mbërritjes në ED.'},
 (20,11):{'b5':'minutave. Maintenance: 0.25-0.5 g/kg IV çdo 6 orë ose sipas nevojës; përshtatet sipas moshës, peshës dhe funksionit renal.'},
 (20,12):{'b18':'mg/mL, të holluara në 100 mL Sodium chloride 0.9%; burimi nuk jep një frekuencë të vetme në këtë rresht.'},
 (20,17):{'b7':'orë ose sipas nevojës.'},
}
NOTE_FIXES={
 (16,6,'b12'):('PËR','PËR FYTYRË:'),
 (16,8,'b10'):('OSE','OSE, TERAPI E KOMBINUAR:'),
 (16,16,'b4'):('OSE','OSE, NAIL PAINT ANTIFUNGAL:'),
 (16,26,'b5'):('NËSE','NËSE KORTIKOSTEROIDËT JANË TË KUNDËRINDIKUAR:'),
 (16,39,'b2'):('PËR','PËR DHIMBJE:'),
 (16,39,'b3'):('PËR','PËR ANKTH AKUT:'),
 **{(17,n,'b2'):('DHE','DHE, NË KONSTIPACION:') for n in (2,3,4,5,6)},
 (18,13,'b7'):('DHE','DHE, VETËM PAS KONSULTËS OFTALMOLOGJIKE:'),
 (18,15,'b4'):('MINUTË LARG NJËRA-TJETRË','IMMEDIATE MEDICAL THERAPY TO LOWER IOP - PIKAT JEPEN NË SUKSESION, 1 MINUTË LARG NJËRA-TJETRË:'),
 (18,15,'b16'):('OSE','OSE, PA NAUZE TË RËNDË - NË PACIENT JO-DIABETIK:'),
 (18,15,'b17'):('OSE','OSE, PA NAUZE TË RËNDË - NË PACIENT DIABETIK:'),
 (20,12,'b17'):('SHËNIM I BURIMIT – Inj. Nalbuphine 10 mg/mL: 2️⃣','SHËNIM I BURIMIT – 2️⃣ Inj. Nalbuphine 10 mg/mL:'),
}
NEW_GUIDES={
 42:('dod-rx-source-ch16-042','SJS/TEN - GASTROPROTEKSION DHE PËRFSHIRJE ORALE'),
 43:('dod-rx-source-ch16-043','SJS/TEN - PËRFSHIRJE OKULARE/UROGJENITALE DHE INFEKSION'),
 44:('dod-rx-source-ch16-044','SUNBURN'),
}
PROFILE={'expected':EXPECTED,'fragments':FRAGMENTS,'title_fixes':{k:v[1] for k,v in NOTE_FIXES.items()},'missing_items':{}}
PROFILE['connector_overrides']={'PLUS/MUND TË KOMBINOHET':{'sourceConnectorLabel':'PLUS/MUND TË KOMBINOHET','condition':'','relation':'plus','selection':'all'}}

def source_sections(path):
    return engine.source_sections(path,EXPECTED)

def seed_reference(section,number,identity):
    """Source-only entries stay unapproved; no parsed dose or drug identity is inferred."""
    values=[p['text'] for p in section['paragraphs'] if p['text']!='Rx']
    blocks=[]
    for index,value in enumerate(values):
        if value.startswith('S. '):continue
        numbered=re.match(r'^(?:\d\ufe0f?\u20e3|🔟)',value)
        next_sig=index+1<len(values) and values[index+1].startswith('S. ')
        if not numbered and not next_sig:continue
        key='source-'+str(index)
        item={'_key':key+'-item','_type':'sourcePrescriptionItem','kind':'source-note','title':engine.clean_title(value)}
        blocks.append({'_key':key,'_type':'prescriptionLogicBlock','order':len(blocks)+1,'relation':'start' if not blocks else 'and','selection':'all','sourceConnectorLabel':'','items':[item]})
    assert blocks, 'New source reference has no aligned items'
    return {'_id':identity,'_rev':'new-source','_type':'prescriptionGuide','title':section['title'],'sourceHeading':section['title'],'chapterNumber':16,'chapterTitle':'Dermatologjia','orderInChapter':number,'externalId':identity,'slug':{'_type':'slug','current':identity},'keywords':[section['title']],'sourceDocument':'Doctor on Duty – Recetat sipas kapitujve – vetëm substanca aktive','version':'1.0-source','reviewStatus':'source-imported','logicBlocks':blocks}

def build(source,existing,source_document_id=SOURCE_ID):
    guides=copy.deepcopy(existing);sections=source_sections(source);new_ids=[]
    for number,(identity,title) in NEW_GUIDES.items():
        section=[x for x in sections if x['chapter']==16][number-1]
        assert section['title']==title, 'Missing source section changed'
        matches=[g for g in guides if g['_id']==identity or (g['chapterNumber']==16 and g['orderInChapter']==number)]
        if not matches:
            guides.append(seed_reference(section,number,identity));new_ids.append(identity)
        else:
            assert len(matches)==1 and matches[0]['_id']==identity and matches[0]['sourceHeading']==title, 'New reference identity changed'
    for guide in guides:
        for block in guide.get('logicBlocks',[]):
            fix=NOTE_FIXES.get((guide['chapterNumber'],guide['orderInChapter'],block['_key']))
            if fix:assert block['items'][0]['title'] in fix, 'Source note heading changed'
    result=engine.build(source,guides,source_document_id,PROFILE)
    result['creates']=[{k:v for k,v in g.items() if k!='_rev'} for g in result['correctedGuides'] if g['_id'] in new_ids]
    result['changes']=[c for c in result['changes'] if c['id'] not in new_ids]
    result['counts'].update(guidesCompared=len(existing),sourceGuides=len(result['correctedGuides']),changedGuides=len(result['changes']),newReferences=len(new_ids))
    return result

if __name__=='__main__':
    import argparse
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('source');p.add_argument('existing');p.add_argument('output');p.add_argument('--source-document-id',default=SOURCE_ID)
    a=p.parse_args();result=build(a.source,json.loads(Path(a.existing).read_text(encoding='utf-8')),a.source_document_id)
    Path(a.output).write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(result['counts']))

"""Read-only, exact-source repairs for prescription chapters 10–15."""
import importlib.util
import json
from pathlib import Path

spec=importlib.util.spec_from_file_location('prescription_repair_engine',Path(__file__).with_name('repair-prescription-chapters-6-10.py'))
engine=importlib.util.module_from_spec(spec);spec.loader.exec_module(engine)
SOURCE_ID=engine.SOURCE_ID
EXPECTED={10:32,11:13,12:18,13:24,14:38,15:24}
FRAGMENTS={
 (12,3):{'b5':'mg/kg secila (maksimumi 750 mg për dozë), 7 ditë larg.'},
 (13,13):{'b8':'ditë, 1 tabletë OD për 3 ditë.'},
 (14,9):{'b4':'mg/ditë në 3-4 doza të ndara.'},
 (14,15):{'b5':'mg TDS ose përgjigje adekuate.'},
 (14,17):{'b2':'mg/24 orë.'},
 (14,18):{'b2':'ditë; 30 mg OD për 1 ditë; 20 mg OD për 1 ditë; 10 mg OD për 1 ditë; 5 mg OD për 1 ditë; pastaj ndërpritet.'},
 (14,26):{'b7':'e tutje: 10 mg/kg.'},
 (14,28):{'b4':'javë. Burimi kërkon vaksinim kundër meningokokut.'},
 (14,36):{'b5':'mg, BD.'},
 (14,38):{'b2':'mg/ditë.'},
}
TITLE_FIXES={
 (14,18,'b7'):'DHE, KUJDESI I SYRIT:',
 (14,21,'b1'):'PËR DEPRESION:',
 (14,21,'b2'):'PËR DEMENCË:',
 (14,21,'b3'):'PËR SIMPTOMA PSIKOTIKE:',
 (14,21,'b4'):'PËR TREMOR:',
 (14,33,'b4'):'PËR URINARY FREQUENCY:',
 (14,33,'b5'):'PËR URINARY RETENTION:',
 (14,33,'b6'):'PËR KONSTIPACION:',
 (14,33,'b7'):'PËR SPASTICITY:',
 (14,33,'b8'):'PËR TREMOR:',
 (14,33,'b9'):'PËR DHIMBJE NEUROPATIKE:',
}
# Eight body paragraphs were styled as Heading 4 in the original DOCX.
# Assert their exact text and multiplicity instead of inventing eight lessons.
EMBEDDED_HEADINGS={
 (12,'Rx'):2,
 (12,'1️⃣ Transfuzion gjaku'):2,
 (12,'S. Në thalassemia major/intermedia kur Hb <7 g/dL dhe/ose ka simptoma të theksuara; target Hb >9-10 g/dL.'):1,
 (12,'OSE'):1,
 (12,'1️⃣ Exchange transfusion'):1,
 (12,'S. Exchange transfusion indikohet për kriza vaso-occlusive të rënda/intractable, acute chest syndrome, priapism dhe stroke.'):1,
}
PROFILE={'expected':EXPECTED,'fragments':FRAGMENTS,'title_fixes':TITLE_FIXES,'missing_items':{},'embedded_headings':EMBEDDED_HEADINGS}

def source_sections(path):
    return engine.source_sections(path,EXPECTED,EMBEDDED_HEADINGS)

def build(source,existing,source_document_id=SOURCE_ID):
    for guide in existing:
        for block in guide.get('logicBlocks',[]):
            fixed=TITLE_FIXES.get((guide['chapterNumber'],guide['orderInChapter'],block['_key']))
            if fixed:
                assert block['items'][0]['title'] in (fixed,'DHE' if fixed.startswith('DHE') else 'PËR'), 'Source note title changed'
    return engine.build(source,existing,source_document_id,PROFILE)

if __name__=='__main__':
    import argparse
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('source');p.add_argument('existing');p.add_argument('output')
    p.add_argument('--source-document-id',default=SOURCE_ID)
    a=p.parse_args()
    result=build(a.source,json.loads(Path(a.existing).read_text(encoding='utf-8')),a.source_document_id)
    Path(a.output).write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(result['counts']))

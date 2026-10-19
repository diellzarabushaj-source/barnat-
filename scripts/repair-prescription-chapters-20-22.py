"""Read-only, exact-source repairs for the final prescription chapters (20–22)."""
import importlib.util
from pathlib import Path

s=importlib.util.spec_from_file_location('prescription_engine',Path(__file__).with_name('repair-prescription-chapters-6-10.py'))
engine=importlib.util.module_from_spec(s);s.loader.exec_module(engine)
SOURCE_ID=engine.SOURCE_ID
EXPECTED={20:17,21:40,22:91}
ARTIFACTS={
 (21,40,'b2'): "muaj.",
 (21,40,'b4'): "muaj.",
 (22,27,'b15'): "PLUS",
 (22,31,'b7'): "mcg) në secilën vrimë, BD.",
 (22,39,'b2'): "mL; 12 kg = 18 mL; 14 kg = 21 mL; 16 kg = 24 mL; 18 kg = 27 mL; 20 kg = 30 mL;",
 (22,39,'b3'): "kg = 33 mL; 24 kg = 36 mL; 28 kg = 42 mL; 32 kg = 48 mL; 36 kg = 54 mL; 42 kg = 63 mL; 48 kg = 72 mL.",
 (22,51,'b9'): "vjeç; nuk jep sasinë e ekstraktit/substancës aktive për mL.",
 (22,60,'b3'): "muaj-5 vjeç: 30 mL/kg gjatë 30 minutave, pastaj 70 mL/kg gjatë 2.5 orëve. Doza e parë mund të përsëritet një herë nëse pulsi radial mbetet shumë i dobët ose i padetektueshëm.",
 (22,62,'b3'): "minutave, pastaj 70 mL/kg gjatë 2.5 orëve.",
 (22,61,'b2'): "orëve. Pas rehidratimit fillestar të vazhdohet ORS sipas nevojës për humbjet në vazhdim.",
 (22,79,'b11'): "doza; Vancomycin 60 mg/kg/ditë (=15 mg/kg/dozë) çdo 6 orë, target trough 10-15 mg/L, maksimumi 4 g/ditë; Penicillin-G 300,000-400,000 units/kg/ditë në doza çdo 4-6 orë, maksimumi 24 milion units/ditë; Meropenem 120 mg/kg/ditë në doza çdo 6-8 orë, maksimumi 6 g/ditë.",
 (22,80,'b9'): "orë.",
 (22,85,'b7'): "TDS.",
 (22,86,'b3'): "mg/ditë.",
}
FRAGMENTS={}
for (chapter,lesson,key),title in ARTIFACTS.items():
    FRAGMENTS.setdefault((chapter,lesson),{})[key]=title
NOTE_FIXES={
 (22,27,'b14'):('SHËNIM I BURIMIT – Inj. Amoxicillin + Clavulanic acid + Clindamycin: 1️⃣','SHËNIM I BURIMIT – 1️⃣ Inj. Amoxicillin + Clavulanic acid + Clindamycin:'),
 (22,84,'b3'):('PËR','PËR KONTROLL TË EPILEPSISË - SHËNIM I BURIMIT:'),
 (22,84,'b4'):('PËR','PËR RIGIDITET DHE SIALORRHEA - SHËNIM I BURIMIT:'),
 (22,91,'b4'):('HISTORI 3 DOZA - CLEAN/MINOR WOUND: ≥','HISTORI ≥3 DOZA - CLEAN/MINOR WOUND:'),
 (22,91,'b5'):('HISTORI 3 DOZA - TETANUS-PRONE WOUND: ≥','HISTORI ≥3 DOZA - TETANUS-PRONE WOUND:'),
}
PROFILE={'expected':EXPECTED,'fragments':FRAGMENTS,'title_fixes':{k:v[1] for k,v in NOTE_FIXES.items()},'missing_items':{}}

def source_sections(path):
    return engine.source_sections(path,EXPECTED)

def build(source,existing,source_document_id=SOURCE_ID):
    for guide in existing:
        for block in guide.get('logicBlocks',[]):
            fix=NOTE_FIXES.get((guide['chapterNumber'],guide['orderInChapter'],block['_key']))
            if fix:assert block['items'][0]['title'] in fix, 'Source note heading changed'
    return engine.build(source,existing,source_document_id,PROFILE)

if __name__=='__main__':
    import argparse,json
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('source');p.add_argument('existing');p.add_argument('output');p.add_argument('--source-document-id',default=SOURCE_ID)
    a=p.parse_args();result=build(a.source,json.loads(Path(a.existing).read_text(encoding='utf-8')),a.source_document_id)
    Path(a.output).write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(result['counts']))

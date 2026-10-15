"""Read-only, source-asserted repairs for the first five prescription chapters.

Invoked by import-medical-hub-docx.py --prescription-repairs. Never contacts CMS.
Refuse a changed source or an unexpected existing structure rather than guessing.
"""
import copy
import hashlib
import re
from docx import Document
from docx.oxml.ns import qn
from docx.text.paragraph import Paragraph

SOURCE_ID = '119EyMzSHYV2SVYXLo6_P2EgkI_8Hukw_uNDvGuewyNg'
DENGUE = 'd4632dab-fb59-4567-be31-15e80761b108'
COVID = '9a740ccb-7eb4-4080-b0ea-5c98b3030fac'
PLEURAL = '929e29f1-c552-41f7-81ae-20154215d254'


def source_sections(source_path):
    doc = Document(source_path)
    sections, chapter, current = {}, 0, None
    for element in doc.element.body:
        if element.tag == qn('w:p'):
            p = Paragraph(element, doc)
            if p.style.name == 'Heading 2':
                match = re.match(r'KAPITULLI\s+(\d+)', p.text)
                if match:
                    chapter, current = int(match[1]), None
            if not 1 <= chapter <= 5:
                continue
            assert not p._p.xpath('.//w:drawing | .//w:pict | .//m:oMath'), 'Unsupported prescription source structure'
            if p.style.name == 'Heading 4':
                current = p.text.strip()
                assert current not in sections, 'Duplicate source heading'
                sections[current] = []
            elif current and p.text.strip():
                sections[current].append(p.text.strip())
        elif element.tag == qn('w:tbl') and 1 <= chapter <= 5:
            raise AssertionError('Prescription tables need an explicit rich table importer')
    return sections


def build(source_path, existing, source_document_id):
    assert source_document_id == SOURCE_ID, 'Use the canonical prescription document, not the book or a copy'
    sections = source_sections(source_path)
    assert len(existing) == len(sections) == 74, 'Expected all 74 guides from chapters 1–5'
    assert {g['sourceHeading'].casefold() for g in existing} == {s.casefold() for s in sections}, 'Source headings differ'
    source_by_heading = {k.casefold(): v for k,v in sections.items()}
    docs = {g['_id']: copy.deepcopy(g) for g in existing}
    before = {g['_id']: copy.deepcopy(g) for g in existing}

    def block(doc_id, key):
        matches = [b for b in docs[doc_id]['logicBlocks'] if b['_key'] == key]
        assert len(matches) == 1, f'Missing block {doc_id}/{key}'
        return matches[0]

    def exact(doc_id, value):
        assert value in source_by_heading[docs[doc_id]['sourceHeading'].casefold()], f'Source paragraph differs: {value}'
        return value

    condition = exact(DENGUE, 'NËSE TROMBOCITET JANË ≤10,000 OSE KA GJAKDERDHJE:')
    vitamin_sig = exact(DENGUE, 'S. 2 mL/ampulë, IV ngadalë, OD.')[3:]
    prior = block(DENGUE,'b9')['items'][0]['sig']
    assert prior in [vitamin_sig, vitamin_sig + ' NËSE TROMBOCITET JANË 10,000 OSE KA GJAKDERDHJE: ≤']
    block(DENGUE,'b9')['items'][0]['sig'] = vitamin_sig
    block(DENGUE,'b10').update(relation='conditional', sourceConnectorLabel='NËSE', condition=condition[len('NËSE '):])

    remdesivir = exact(COVID, 'S. Infuzion IV në 100 mL 0.9% NaCl si dozë ngarkuese; pastaj remdesivir 100 mg IV në 100 mL 0.9% NaCl, OD, për 45 minuta deri 1 orë. Gjithsej 4-9 doza nga 100 mg OD.')[3:]
    current_sig = block(COVID,'b9')['items'][0]['sig']
    assert current_sig == remdesivir or remdesivir == current_sig + ' 100 ' + block(COVID,'b10')['items'][0]['title']
    block(COVID,'b9')['items'][0]['sig'] = remdesivir
    docs[COVID]['logicBlocks'] = [b for b in docs[COVID]['logicBlocks'] if b['_key'] != 'b10']
    enoxaparin_sig = exact(COVID, 'S. 100 IU/kg (1.5 mg/kg), SC, OD.')[3:]
    support_sig = exact(COVID, 'S. Hidratim adekuat, ushqyerje dhe pushim; burimi udhëzon shtrim në ICU dhe intubim nëse ka shenja të dështimit respirator, dispne me hipoksemi ose takipne RR >30/min.')[3:]
    enoxaparin = block(COVID,'b13')
    assert enoxaparin['items'][0]['sig'] in [enoxaparin_sig, enoxaparin_sig + ' ' + support_sig]
    assert '9️⃣ Inj. Enoxaparin sodium 40 mg / 60 mg / 80 mg' in source_by_heading[docs[COVID]['sourceHeading'].casefold()]
    enoxaparin['items'][0].update(sig=enoxaparin_sig, strength='40 mg / 60 mg / 80 mg')
    enoxaparin.pop('note',None)
    if not any(b['_key'] == 'b13-support' for b in docs[COVID]['logicBlocks']):
        blocks = docs[COVID]['logicBlocks']
        index = blocks.index(enoxaparin) + 1
        blocks.insert(index, {'_key':'b13-support','_type':'prescriptionLogicBlock','order':14,'relation':'and','sourceConnectorLabel':'DHE','selection':'all','items':[{'_key':'i13-support','_type':'sourcePrescriptionItem','order':14,'sourceNumber':10,'kind':'supportive-care','title':'Kujdes mbështetës','sig':support_sig}]})
    for order,b in enumerate(docs[COVID]['logicBlocks'],1):
        b['order'] = order
    assert block(COVID,'b13-support')['items'][0]['sig'] == support_sig

    pleural = block(PLEURAL,'b2')
    assert pleural.get('note','') in ['', 'KAPITULLI 4 - PËRSHKRIMI I BARNAVE, AFTËSITË ADMINISTRATIVE']
    pleural.pop('note',None)

    changed = [g for ident,g in docs.items() if g != before[ident]]
    assert all(g['reviewStatus'] == before[g['_id']]['reviewStatus'] for g in changed)
    return {
        'sourceDocumentId':SOURCE_ID,
        'sourceSha256':hashlib.sha256(open(source_path,'rb').read()).hexdigest(),
        'counts':{'guidesCompared':74,'chapters':5,'changedGuides':len(changed)},
        'documents':{g['_id']:{'ifRevisionId':g['_rev'],'patches':[{'set':{'logicBlocks':g['logicBlocks']}}]} for g in changed},
        'rollback':{g['_id']:{'patches':[{'set':{'logicBlocks':before[g['_id']]['logicBlocks']}}]} for g in changed},
        'correctedGuides':list(docs.values()),
    }

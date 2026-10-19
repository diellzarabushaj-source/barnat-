"""Regression for exact source alignment, fragments, restored items and repeat runs."""
import copy
import importlib.util
import tempfile
from pathlib import Path
from docx import Document

spec=importlib.util.spec_from_file_location('rx610',Path(__file__).parents[1]/'scripts/repair-prescription-chapters-6-10.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

def block(key,title,sig='Truncated',relation='start'):
    return {'_key':key,'_type':'prescriptionLogicBlock','order':1,'relation':relation,'selection':'all','sourceConnectorLabel':'','items':[{'_key':key+'-item','_type':'sourcePrescriptionItem','kind':'source-note','title':title,'sig':sig,'order':1}]}

assert module.connector(['PASTAJ'],{'relation':'conditional','sourceConnectorLabel':'NËSE','selection':'choose-one'}) == {'sourceConnectorLabel':'PASTAJ','condition':'','relation':'and','selection':'all'}
for word,relation in [('DHE','and'),('OSE','or'),('PLUS','plus'),('NËSE','conditional'),('PËR','conditional'),('KUR','conditional')]:
    fixed=module.connector([word+', QA condition:'],{'relation':'conditional','sourceConnectorLabel':'NËSE','selection':'choose-one'})
    assert fixed['relation']==relation and fixed['sourceConnectorLabel']==word and fixed['condition']=='QA condition:'
    assert fixed['selection']==('choose-one' if word=='OSE' else 'all')

with tempfile.TemporaryDirectory() as temp:
    doc=Document();guides=[]
    for chapter,count in module.EXPECTED.items():
        doc.add_heading(f'KAPITULLI {chapter} - QA',2)
        for order in range(1,count+1):
            title=f'QA {chapter}.{order}'
            doc.add_heading(title,4);doc.add_paragraph('Rx')
            item_title=module.TITLE_FIXES.get((chapter,order,'b1'),'Tab. QA 10 mg')
            entries=[block('b1',item_title)]
            doc.add_paragraph('1️⃣ '+item_title)
            doc.add_paragraph('S. Complete instruction 10 mg, BD; ≥30 mL/min.');doc.add_paragraph('S. Separate support instruction.')
            for key,fragment in module.FRAGMENTS.get((chapter,order),{}).items():
                entries.append(block(key,fragment,''))
            # These two explicit source-title fixes have their own original keys.
            for (c,n,key),fixed_title in module.TITLE_FIXES.items():
                if (c,n)!=(chapter,order) or key=='b1':continue
                doc.add_paragraph('DHE');doc.add_paragraph(fixed_title+':');doc.add_paragraph('S. Exact source note.')
                entries.append(block(key,fixed_title,'Truncated',relation='and'))
            for source_title,relation,kind,generic,form,strength in module.MISSING_ITEMS.get((chapter,order),[]):
                doc.add_paragraph('OSE' if relation=='or' else 'DHE')
                doc.add_paragraph('2️⃣ '+source_title if kind=='active-substance' else source_title+':')
                doc.add_paragraph('S. Newly recovered source instruction.')
            guides.append({'_id':f'qa-{chapter}-{order}','_rev':'unchanged-rev','title':title,'sourceHeading':title,'chapterNumber':chapter,'orderInChapter':order,'reviewStatus':'review' if order%2 else 'verified','logicBlocks':entries})
    path=Path(temp)/'source.docx';doc.save(path)
    result=module.build(path,guides)
    assert result['counts']['guidesCompared']==136
    assert result['counts']['removedSplitArtifacts']==12
    assert result['counts']['changedGuides']==136
    assert sum(len(g['logicBlocks']) for g in result['correctedGuides']) == 136+3+11
    for old,new in zip(guides,result['correctedGuides']):
        assert old['_id']==new['_id'] and old['_rev']==new['_rev'] and old['reviewStatus']==new['reviewStatus']
        first=new['logicBlocks'][0]
        assert first['_key']=='b1' and first['items'][0]['_key']=='b1-item'
        assert first['items'][0]['sig']=='Complete instruction 10 mg, BD; ≥30 mL/min.'
        assert first['note']=='S. Separate support instruction.'
        assert all(b['items'][0]['title'] not in module.FRAGMENTS.get((old['chapterNumber'],old['orderInChapter']),{}).values() for b in new['logicBlocks'])
    assert module.build(path,result['correctedGuides'])['counts']['changedGuides']==0
    try:module.build(path,guides,'wrong-source')
    except AssertionError as e:assert 'canonical' in str(e)
    else:raise AssertionError('Wrong canonical source accepted')
    changed=copy.deepcopy(guides);changed[0]['sourceHeading']='Unrelated title'
    try:module.build(path,changed)
    except AssertionError:pass
    else:raise AssertionError('Unexpected source heading accepted')
    # A rich table must be rejected explicitly rather than flattened/dropped.
    doc.add_table(rows=1,cols=1).cell(0,0).text='Dose table';doc.save(path)
    try:module.source_sections(path)
    except AssertionError as e:assert 'rich table' in str(e)
    else:raise AssertionError('Unsupported table silently accepted')
print('Chapters 6–10: all 136 guides, 12 fragments, 11 restored items, exact text, notes, IDs/status, source guards and idempotence passed.')

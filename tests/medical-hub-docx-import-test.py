"""Importer regression: native lists, blank image paragraphs and source order.

Run with python-docx installed: python tests/medical-hub-docx-import-test.py
"""
import base64
import copy
import hashlib
import importlib.util
import io
import tempfile
from pathlib import Path
from docx import Document
from docx.oxml import parse_xml
from docx.oxml.ns import qn

spec = importlib.util.spec_from_file_location('source_import', Path(__file__).parents[1] / 'scripts/import-medical-hub-docx.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
png = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2ioAAAAASUVORK5CYII=')
doc = Document()
numbering = doc.part.numbering_part.element
namespace = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
for num_id, fmt, pattern, start in [(7001, 'bullet', '●', 1), (7002, 'decimal', '%1.', 1), (7003, 'decimal', '%1.', 5)]:
    numbering.append(parse_xml(f'<w:abstractNum xmlns:w="{namespace}" w:abstractNumId="{num_id}"><w:lvl w:ilvl="0"><w:start w:val="{start}"/><w:numFmt w:val="{fmt}"/><w:lvlText w:val="{pattern}"/></w:lvl></w:abstractNum>'))
    numbering.append(parse_xml(f'<w:num xmlns:w="{namespace}" w:numId="{num_id}"><w:abstractNumId w:val="{num_id}"/></w:num>'))

def native(text, num_id):
    p = doc.add_paragraph(text)
    props = p._p.get_or_add_pPr().get_or_add_numPr()
    props.get_or_add_numId().val = num_id
    props.get_or_add_ilvl().val = 0
    return p

doc.add_heading('KAPITULLI 11 • TEST', 1)
doc.add_paragraph('Chapter introduction')
doc.add_paragraph('Shënim redaktorial: Source annotation').runs[0].bold = True
doc.add_heading('1. FIRST', 2)
doc.add_paragraph('Lesson opening body')
doc.add_heading('RX • FIRST', 3)
native('Native bullet', 7001).runs[0].bold = True
native('First numbered item', 7002)
native('Second numbered item', 7002)
doc.add_paragraph().add_run().add_picture(io.BytesIO(png))
doc.add_paragraph('After image')
table = doc.add_table(rows=2, cols=1)
table.cell(0, 0).text = 'Header'
table.cell(1, 0).text = 'Cell'
doc.add_heading('2. RX • SECOND', 2)
doc.add_heading('HAPAT PRAKTIKË', 3)
native('Continued numbered item', 7002)
native('Restarted at five', 7003)
doc.add_heading('BURIME PËR SHËNIMET REDAKTORIALE', 3)
doc.add_paragraph('Source reference')
note = 'Titulli dhe renditja vijnë nga libri kryesor. Përmbajtja klinike duhet të shkruhet dhe verifikohet në Studio para publikimit.'
existing = [{'_id': f'fixture-topic-{order}', '_rev': 'fixture-revision', 'chapter': {'_ref': 'fixture-chapter-11'}, 'order': order, 'sections': [{'_key': 'editorial-start', 'content': [{'_key': 'editorial-note', '_type': 'clinicalCallout', 'body': [{'children': [{'text': note}]}]}]}]} for order in [1, 2]]
assets = {hashlib.sha256(png).hexdigest(): {'assetId': 'image-fixture-1x1-png'}}
with tempfile.TemporaryDirectory() as temp:
    path = Path(temp) / 'fixture.docx'
    doc.save(path)
    try:
        module.build(path, existing, True)
    except AssertionError as error:
        assert 'Upload source image' in str(error)
    else:
        raise AssertionError('A blank image paragraph was silently dropped')
    result = module.build(path, existing, True, assets)
    intro = result['topics'][0]['sections'][0]
    assert intro['title'] == '__SOURCE_BODY__' and intro['_key'] == 'source-11-intro'
    assert [''.join(s['text'] for s in b['children']) for b in intro['content']] == ['Chapter introduction', 'Shënim redaktorial: Source annotation']
    assert intro['content'][1]['children'][0]['marks'] == ['strong']
    assert result['counts']['introductionBlocks'] == 2
    assert len(result['topics'][1]['sections']) == 2, 'Do not repeat the introduction in subsequent lessons'
    rebuilt = module.build(path, [{**existing[i], 'originalTitle': t['originalTitle'], 'sections': t['sections']} for i, t in enumerate(result['topics'])], False, assets)
    assert [t['sections'] for t in rebuilt['topics']] == [t['sections'] for t in result['topics']], 'Introduction import must be repeatable'
    assert result['topics'][0]['sections'][1]['content'][0]['children'][0]['text'] == 'Lesson opening body'
    keys = [s['_key'] for s in result['topics'][0]['sections']]
    assert len(keys) == len(set(keys)), 'Chapter introduction and lesson opening need separate identities'
    first = result['topics'][0]['sections'][2]['content']
    assert [b['_type'] for b in first] == ['block', 'block', 'block', 'medicalFigure', 'block', 'medicalTable']
    assert first[0]['children'][0]['text'] == '● '
    assert first[0]['children'][1]['marks'] == ['strong']
    assert first[3]['image']['asset']['_ref'] == assets[hashlib.sha256(png).hexdigest()]['assetId']
    second_volume_id = '1QNVPfGpPp3lghWIcPf3ynT1rrFMTA5IilJuZ1tEtI_M'
    second_volume = module.build(path, existing, True, assets, second_volume_id)
    assert second_volume['sourceDocumentId'] == second_volume_id
    assert second_volume['sourceSha256'] == result['sourceSha256']
    second_figure = second_volume['topics'][0]['sections'][2]['content'][3]
    assert second_figure['sourceUrl'] == f'https://docs.google.com/document/d/{second_volume_id}/edit'
    assert second_figure['image'] == first[3]['image'], 'Changing volume attribution must preserve the source asset'
    second = result['topics'][1]['sections'][0]['content']
    assert [b['children'][0]['text'] for b in second] == ['3. ', '5. ']
    assert [s['sectionType'] for s in result['topics'][1]['sections']] == ['prescription', 'general']
    assert result['counts']['nativeListItems'] == 5
    edited = copy.deepcopy(existing)
    edited[0]['sections'][0]['content'][0]['body'][0]['children'][0]['text'] = 'Authored note'
    try:
        module.build(path, edited, True, assets)
    except AssertionError as error:
        assert 'Edited migration note' in str(error)
    else:
        raise AssertionError('An authored note was overwritten')
with tempfile.TemporaryDirectory() as temp:
    dotted = Document()
    dotted.add_heading('KAPITULLI 16 • TEST', 1)
    dotted.add_paragraph('Chapter introduction')
    dotted.add_heading('16.1 • Lesson title', 2)
    dotted.add_heading('RX • TREATMENT', 3)
    dotted.add_paragraph('Original treatment').runs[0].bold = True
    dotted.add_heading('Referencat e shënimeve klinike — kapitulli 16', 2)
    dotted.add_paragraph('Original reference')
    path = Path(temp) / 'dotted.docx'
    dotted.save(path)
    scaffold = copy.deepcopy(existing[0])
    scaffold.update(_id='fixture-topic-16-1', chapter={'_ref': 'fixture-chapter-16'})
    result = module.build(path, [scaffold], True)
    topic = result['topics'][0]
    assert topic['originalTitle'] == '16.1 • Lesson title'
    assert topic['title'] == 'Lesson title'
    assert [s['sectionType'] for s in topic['sections']] == ['general', 'prescription', 'general']
    assert topic['sections'][-1]['title'] == 'Referencat e shënimeve klinike — kapitulli 16'
    assert topic['sections'][-1]['content'][0]['children'][0]['text'] == 'Original reference'
    assert topic['sections'][1]['content'][0]['children'][0]['marks'] == ['strong']
    try:
        module.lesson_heading('15.1 • Wrong chapter', 16)
    except AssertionError:
        pass
    else:
        raise AssertionError('A mismatched dotted chapter was accepted')
with tempfile.TemporaryDirectory() as temp:
    continued = Document()
    continued.add_heading('KAPITULLI 24 — TEST', 1)
    continued.add_heading('24.1 — Antibiotikët', 2)
    continued.add_paragraph('Original opening paragraph')
    for text in ['First table', 'Second table']:
        continued.add_heading('Antibiotikët — vijim', 3)
        table = continued.add_table(rows=2, cols=1)
        table.cell(0, 0).text = 'Header'
        table.cell(1, 0).text = text
    path = Path(temp) / 'continued.docx'
    continued.save(path)
    scaffold = copy.deepcopy(existing[0])
    scaffold.update(_id='fixture-topic-24-1', chapter={'_ref': 'fixture-chapter-24'})
    result = module.build(path, [scaffold], True)
    topic = result['topics'][0]
    assert topic['originalTitle'] == '24.1 — Antibiotikët'
    assert topic['title'] == 'Antibiotikët'
    assert [s['title'] for s in topic['sections']] == ['__SOURCE_BODY__', 'Antibiotikët — vijim', 'Antibiotikët — vijim']
    assert len({s['_key'] for s in topic['sections']}) == 3, 'Repeated continuation headings and opening body need distinct identities'
    assert [s['content'][0]['rows'][0]['cells'][0] for s in topic['sections'][1:]] == ['First table', 'Second table']
    rebuilt = module.build(path, [{**scaffold, 'originalTitle': topic['originalTitle'], 'sections': topic['sections']}])
    assert rebuilt['topics'][0]['sections'] == topic['sections'], 'Repeated source sections must remain distinct on rebuild'
print('DOCX import: source lists, bold, images/order, author guard, lesson delimiters, repeated continuation sections and trailing references passed.')

#!/usr/bin/env python3
"""Build source-faithful patches from an exported canonical Google Doc.

Usage: python scripts/import-medical-hub-docx.py source.docx existing-topics.json output.json
Requires python-docx. This script never writes to Sanity.
Pass --initialize-placeholders to replace migration-only scaffolds with source
titles and sections. This mode refuses documents containing authored content.
"""
import copy
import hashlib
import json
import re
import sys
from collections import Counter
from docx import Document
from docx.oxml.ns import qn
from docx.table import Table
from docx.text.paragraph import Paragraph
from docx.text.run import Run


def key(prefix, index):
    return f"{prefix}-{index}"


def paragraph_block(p, ident):
    assert not p._p.xpath('.//w:drawing | .//w:pict | .//m:oMath'), f'Unsupported image/math at {ident}; import it explicitly instead of discarding it'
    spans, definitions = [], []
    # Iterate XML, including runs inside hyperlinks; Paragraph.runs omits those.
    for elem in p._p:
        runs = [elem] if elem.tag == qn('w:r') else list(elem.iter(qn('w:r'))) if elem.tag == qn('w:hyperlink') else []
        for run_element in runs:
            r = Run(run_element, p)
            if not r.text:
                continue
            marks = []
            for attribute, mark in [('bold', 'strong'), ('italic', 'em'), ('underline', 'underline')]:
                value = getattr(r, attribute)
                if value is None:
                    value = getattr(p.style.font, attribute)
                if value:
                    marks.append(mark)
            if r.font.strike:
                marks.append('strike-through')
            if elem.tag == qn('w:hyperlink'):
                rid = elem.get(qn('r:id'))
                if rid and rid in p.part.rels:
                    link_key = key(ident + '-link', len(definitions))
                    definitions.append({'_type': 'link', '_key': link_key, 'href': p.part.rels[rid].target_ref})
                    marks.append(link_key)
            spans.append({'_type': 'span', '_key': key(ident + '-s', len(spans)), 'text': r.text, 'marks': marks})
    assert ''.join(s['text'] for s in spans) == p.text, f"Unsupported paragraph content at {ident}: {p.text}"
    result = {'_type': 'block', '_key': ident, 'style': 'h3' if p.style.name.startswith('Heading') else 'normal', 'markDefs': definitions, 'children': spans}
    # Keep literal source markers in the stored spans; the renderer consumes them
    # once, preserving the original numbering and bold ranges across run boundaries.
    number = re.match(r'^\s*(\d+)\.\s+', p.text)
    bullet = re.match(r'^(\s*)[•·‣▪◦]\s+', p.text)
    if number:
        result.update(listItem='number', level=1)
    elif bullet:
        result.update(listItem='bullet', level=2 if len(bullet[1]) >= 2 else 1)
    elif p._p.pPr is not None and p._p.pPr.numPr is not None:
        raise ValueError(f'Native Word numbering at {ident} needs an explicit numbering resolver; do not flatten it')
    return result


def table_block(table, ident):
    grid = [list(row.cells) for row in table.rows]
    assert len(grid) >= 2, f'Table without a body: {ident}'
    width = len(table.columns)
    assert all(len(row) == width for row in grid), f'Unsupported irregular table: {ident}'
    headers = [cell.text for cell in grid[0]]
    result = {'_type': 'medicalTable', '_key': ident, 'columns': headers, 'rows': []}
    # Rich cells are optional alongside the existing exact plain-text values.
    # They retain merged-cell geometry and support future inline formatting.
    seen = set()
    for ri, row in enumerate(grid):
        rich = []
        for ci, cell in enumerate(row):
            assert not cell._tc.xpath('.//w:tbl'), f'Unsupported nested table at {ident}; do not flatten it'
            if cell._tc in seen:
                continue
            seen.add(cell._tc)
            col_span = 1
            while ci + col_span < width and row[ci + col_span]._tc is cell._tc:
                col_span += 1
            row_span = 1
            while ri + row_span < len(grid) and grid[ri + row_span][ci]._tc is cell._tc:
                row_span += 1
            content = [paragraph_block(p, key(f'{ident}-r{ri}-c{ci}', pi)) for pi, p in enumerate(cell.paragraphs) if p.text]
            rich.append({'_type': 'medicalTableCell', '_key': f'{ident}-r{ri}-c{ci}', 'columnIndex': ci, 'colSpan': col_span, 'rowSpan': row_span, 'content': content})
        if ri == 0:
            result['headerCells'] = rich
        else:
            result['rows'].append({'_type': 'medicalTableRow', '_key': f'{ident}-r{ri}', 'cells': [c.text for c in row], 'richCells': rich})
    return result


def initialize_placeholders(doc, existing):
    prepared = copy.deepcopy(existing)
    lookup = {(int(t['chapter']['_ref'].split('-')[-1]), int(t['order'])): t for t in prepared}
    for old in prepared:
        sections = old.get('sections', [])
        assert len(sections) == 1 and sections[0].get('_key') == 'editorial-start', f'Authored sections at {old["_id"]}; initialize explicitly instead'
        content = sections[0].get('content', [])
        assert len(content) == 1 and content[0].get('_key') == 'editorial-note' and content[0].get('_type') == 'clinicalCallout', f'Authored content at {old["_id"]}'
        note = ''.join(span.get('text', '') for block in content[0].get('body', []) for span in block.get('children', []))
        assert note == 'Titulli dhe renditja vijnë nga libri kryesor. Përmbajtja klinike duhet të shkruhet dhe verifikohet në Studio para publikimit.', f'Edited migration note at {old["_id"]}; preserve the author edits'
        old['sections'] = []
    chapter, topic = 0, None
    for element in doc.element.body:
        if element.tag != qn('w:p'):
            continue
        p = Paragraph(element, doc)
        if p.style.name == 'Heading 1':
            match = re.search(r'KAPITULLI\s+(\d+)', p.text)
            chapter, topic = (int(match[1]) if match else 0), None
        elif p.style.name == 'Heading 2':
            match = re.match(r'^(\d+)\.\s*(.*)', p.text)
            topic = lookup.get((chapter, int(match[1]))) if match else None
            if topic:
                topic.update(originalTitle=p.text, title=match[2])
        elif topic and p.style.name == 'Heading 3' and not p.text.endswith(':'):
            topic['sections'].append({'_type': 'medicalSection', '_key': f'source-{chapter}-{topic["order"]}-section-{len(topic["sections"])}', 'title': p.text, 'sectionType': 'prescription' if p.text.startswith('RX') else 'general'})
    return prepared


def build(source_path, existing, initialize=False):
    doc = Document(source_path)
    if initialize:
        existing = initialize_placeholders(doc, existing)
    lookup = {(int(t['chapter']['_ref'].split('-')[-1]), int(t['order'])): t for t in existing}
    chapters = {chapter for chapter, _ in lookup}
    output, counts = [], Counter()
    chapter = 0
    topic = section = None
    source_sequence = []
    emitted_sequence = []

    def append_section(title):
        nonlocal section
        old = next((s for s in topic['existing']['sections'] if s['title'] == title), None)
        section = copy.deepcopy(old) if old else {'_type': 'medicalSection', '_key': f"source-{chapter}-{topic['order']}-section-{len(topic['sections'])}", 'title': title, 'sectionType': 'general'}
        section['content'] = []
        section.pop('summary', None)
        topic['sections'].append(section)

    for index, element in enumerate(doc.element.body):
        if element.tag == qn('w:p'):
            p = Paragraph(element, doc)
            if p.style.name == 'Heading 1':
                match = re.search(r'KAPITULLI\s+(\d+)', p.text)
                chapter = int(match[1]) if match else 0
                topic = section = None
                continue
            if chapter not in chapters:
                continue
            if p.style.name == 'Heading 2':
                match = re.match(r'^(\d+)\.\s*(.*)', p.text)
                assert match, f'Unnumbered lesson at {index}'
                order = int(match[1])
                old = lookup[(chapter, order)]
                assert old['originalTitle'] == p.text, f'Topic mismatch: {old["_id"]}'
                topic = {'_id': old['_id'], '_rev': old['_rev'], 'chapterNumber': chapter, 'order': order, 'existing': old, 'sections': []}
                if initialize:
                    topic.update(title=old['title'], originalTitle=old['originalTitle'])
                output.append(topic)
                section = None
                counts['topics'] += 1
                continue
            if not topic or not p.text.strip():
                continue
            source_sequence.append(('p', p.text))
            if p.style.name == 'Heading 3' and any(s['title'] == p.text for s in topic['existing']['sections']):
                append_section(p.text)
                emitted_sequence.append(('p', section['title']))
            else:
                if section is None:
                    append_section('__SOURCE_BODY__')
                block = paragraph_block(p, f'source-p{index}')
                section['content'].append(block)
                emitted_sequence.append(('p', ''.join(s['text'] for s in block['children'])))
                counts['paragraphs'] += 1
                counts['boldSpans'] += sum('strong' in s['marks'] for s in block['children'])
                if block.get('listItem'):
                    counts['listItems'] += 1
        elif element.tag == qn('w:tbl') and chapter in chapters and topic:
            table = Table(element, doc)
            if section is None:
                append_section('__SOURCE_BODY__')
            block = table_block(table, f'source-table-{index}')
            section['content'].append(block)
            source_sequence.append(('table', [[c.text for c in row.cells] for row in table.rows]))
            emitted_sequence.append(('table', [block['columns']] + [row['cells'] for row in block['rows']]))
            counts['tables'] += 1
    assert source_sequence == emitted_sequence, 'Source text/table order changed'
    assert len(output) == len(existing), 'Missing or duplicate lesson'
    for topic in output:
        assert all(s['content'] for s in topic['sections']), f'Empty section: {topic["_id"]}'
        topic.pop('existing')
    return {'sourceSha256': hashlib.sha256(open(source_path, 'rb').read()).hexdigest(), 'sourceDocumentId': '1QN0U5sWSj9GdyNV5oZoZIobmjV0TmCwJD937xzzPgVw', 'counts': dict(counts), 'topics': output}


if __name__ == '__main__':
    args = sys.argv[1:]
    initialize = '--initialize-placeholders' in args
    source, existing_path, output_path = [arg for arg in args if arg != '--initialize-placeholders']
    result = build(source, json.load(open(existing_path)), initialize)
    with open(output_path, 'w') as target:
        json.dump(result, target, ensure_ascii=False, indent=2)
    print(json.dumps(result['counts']))

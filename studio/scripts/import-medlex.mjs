import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import {fileURLToPath} from 'node:url'
import {getCliClient} from 'sanity/cli'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'data/medlex-chapters.json'), 'utf8'))
const artwork = JSON.parse(fs.readFileSync(path.join(root, 'data/medlex-chapters-artwork.json'), 'utf8'))
const client = getCliClient({apiVersion: '2026-08-30'}).withConfig({projectId: '4wdtp8cz', dataset: 'production', useCdn: false})
const apply = process.argv.includes('--apply')
const reportPath = process.argv.find(value => value.startsWith('--report='))?.slice(9)
const digest = buffer => crypto.createHash('sha256').update(buffer).digest('hex')
const assetById = new Map(artwork.cards.map(item => [item.id, item]))
const existing = await client.fetch('*[_type in ["medlexChapter","medlexSubchapter","medlexCard"]]{_id,_type,externalId,term,contentStatus,definition,example,imageSha256,importSource}', {}, {perspective: 'raw'})
const lookup = new Map()
for (const item of existing) {
  const key = `${item._type}:${item.externalId}`
  if (lookup.has(key)) throw new Error(`Duplicate/draft record requires review: ${key}`)
  lookup.set(key, item)
}
const result = {mode: apply ? 'apply' : 'dry-run', created: [], updated: [], preserved: [], assets: [], chapters: catalog.categories.length, cards: 0}

async function ensure(type, externalId, content) {
  const key = `${type}:${externalId}`
  const found = lookup.get(key)
  if (found) {result.preserved.push(key); return found._id}
  if (!apply) return `preview-${externalId}`
  const created = await client.create({_type: type, externalId, ...content})
  lookup.set(key, created)
  result.created.push({type, externalId, id: created._id})
  return created._id
}
const reference = id => ({_type: 'reference', _ref: id})

for (const chapter of catalog.categories) {
  const chapterId = await ensure('medlexChapter', chapter.id, {title: chapter.title, heading: chapter.heading, description: chapter.description, order: Number(chapter.id)})
  const groups = new Map()
  for (const [order, group] of chapter.groups.entries()) {
    const id = await ensure('medlexSubchapter', `${chapter.id}:${group.id}`, {chapter: reference(chapterId), groupId: group.id, title: group.label, order})
    groups.set(group.id, id)
  }
  // The first two chapters retain their already-published local collections.
  for (const [order, term] of (chapter.terms || []).entries()) {
    result.cards++
    const art = assetById.get(term.id)
    const found = lookup.get(`medlexCard:${term.id}`)
    // Only fill an untouched placeholder on a later import. Never overwrite
    // authored content, changed images, review metadata or existing drafts.
    const fill = found && art && found.importSource === 'drx-medlex-repository-v1' && found.term === term.term && found.contentStatus === 'planned' && !found.definition && !found.example
    if (found && !fill) {result.preserved.push(`medlexCard:${term.id}`); continue}
    const content = {subchapter: reference(groups.get(term.group)), order, term: term.term,
      english: term.english || '', latin: term.latin || '', aliases: term.aliases || '',
      definition: term.definition || '', example: term.example || '', contentStatus: term.status,
      clinicalStatus: 'draft', importSource: 'drx-medlex-repository-v1', references: term.references || [], illustrationBrief: term.illustrationBrief || ''}
    if (art) {
      const filename = path.join(root, 'assets/medlex-chapters', art.file)
      const bytes = fs.readFileSync(filename)
      if (digest(bytes) !== art.sha256 || digest(term.definition) !== art.definitionSha256 || digest(term.example) !== art.exampleSha256) throw new Error(`Content/image integrity mismatch: ${term.id}`)
      if (apply) {
        const asset = await client.assets.upload('image', bytes, {filename: art.file, contentType: 'image/webp', title: `DRX MEDLEX · ${term.term}`, description: 'Ilustrim edukativ i gjeneruar me AI; rishikimi klinik mbetet draft.'})
        content.image = {_type: 'image', asset: reference(asset._id), alt: `Ilustrim edukativ: ${term.term}`}
        Object.assign(content, {artworkVersion: artwork.version, sourceSha256: art.sourceSha256, imageSha256: art.sha256, definitionSha256: art.definitionSha256, exampleSha256: art.exampleSha256})
        result.assets.push({externalId: term.id, assetId: asset._id, sha256: art.sha256})
      }
    }
    if (fill && apply) {
      for (const key of ['subchapter', 'order', 'term', 'clinicalStatus']) delete content[key]
      await client.patch(found._id).set(content).commit()
      result.updated.push({externalId: term.id, id: found._id})
    } else await ensure('medlexCard', term.id, content)
  }
}
if (reportPath) fs.writeFileSync(path.resolve(reportPath), JSON.stringify(result, null, 2))
console.log(JSON.stringify({mode: result.mode, chapters: result.chapters, cards: result.cards, created: result.created.length, updated: result.updated.length, preserved: result.preserved.length, uploaded: result.assets.length}))

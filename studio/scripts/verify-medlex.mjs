import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
import {getCliClient} from 'sanity/cli'

const require = createRequire(import.meta.url)
const {QUERY, mergeCatalog} = require('../../lib/medlex-sanity.js')
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const original = JSON.parse(fs.readFileSync(path.join(root, 'data/medlex-chapters.json'), 'utf8'))
const artwork = JSON.parse(fs.readFileSync(path.join(root, 'data/medlex-chapters-artwork.json'), 'utf8'))
const client = getCliClient({apiVersion: '2026-08-30'}).withConfig({projectId: '4wdtp8cz', dataset: 'production', useCdn: false})
const remote = await client.fetch(QUERY, {}, {perspective: 'published'})
assert.equal(remote.chapters.length, 18)
assert.equal(remote.subchapters.length, original.categories.reduce((sum, item) => sum + item.groups.length, 0))
assert.equal(remote.cards.length, 299)
const catalog = mergeCatalog(remote)
assert.deepEqual(catalog.categories.slice(0, 2), original.categories.slice(0, 2))
for (const chapter of original.categories.slice(2)) for (const term of chapter.terms) {
  const row = remote.cards.find(item => item.externalId === term.id)
  assert.equal(row.term, term.term, term.id)
  assert.equal(row.subchapter.chapter, chapter.id, term.id)
  assert.equal(row.subchapter.groupId, term.group, term.id)
  assert.equal(row.definition, term.definition, term.id)
  assert.equal(row.example, term.example, term.id)
  assert.equal(row.contentStatus, term.status, term.id)
  assert.equal(row.clinicalStatus, 'draft', term.id)
}
let cursor = 0
const sourceAssets = await client.fetch('*[_type == "medlexCard" && defined(image.asset)]{externalId,"asset":image.asset->{sha1hash,size,mimeType}}', {}, {perspective: 'published'})
for (const art of artwork.cards) {
  const bytes = fs.readFileSync(path.join(root, 'assets/medlex-chapters', art.file))
  const asset = sourceAssets.find(item => item.externalId === art.id)?.asset
  assert.equal(asset?.sha1hash, crypto.createHash('sha1').update(bytes).digest('hex'), art.id)
  assert.equal(asset.size, bytes.length, art.id)
}
async function worker() {
  while (cursor < artwork.cards.length) {
    const art = artwork.cards[cursor++]
    const row = remote.cards.find(item => item.externalId === art.id)
    const response = await fetch(row.imageUrl, {signal: AbortSignal.timeout(30000)})
    assert.equal(response.status, 200, art.id)
    // Sanity stores the source unchanged but transforms CDN responses, even
    // without query parameters. Compare asset source hashes above, then check
    // that each corresponding CDN image is actually served successfully.
    assert.ok(response.headers.get('content-type')?.startsWith('image/'), art.id)
    assert.ok((await response.arrayBuffer()).byteLength > 10000, art.id)
  }
}
await Promise.all(Array.from({length: 4}, worker))
const report = {status: 'passed', checkedAt: new Date().toISOString(), projectId: '4wdtp8cz', dataset: 'production',
  studio: 'https://drx-medical-hub-authoring.sanity.studio/', chapters: remote.chapters.length,
  subchapters: remote.subchapters.length, cards: remote.cards.length, illustrated: artwork.cards.length,
  allImageSourceHashesMatch: true, allCdnImagesAvailable: true, allTermsAndGroupsMatch: true, clinicalReviewStatus: 'draft', chapters01And02Unchanged: true}
const reportPath = process.argv.find(value => value.startsWith('--report='))?.slice(9)
if (reportPath) fs.writeFileSync(path.resolve(reportPath), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report))

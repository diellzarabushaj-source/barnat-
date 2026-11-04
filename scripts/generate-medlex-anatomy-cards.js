#!/usr/bin/env node
'use strict';

// Chapter 02 uses individually authored imagegen artwork. Validate installed
// files instead of silently replacing them with the former schematic renderer.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '..');
const dictionary = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/medlex-anatomy.json'), 'utf8'));
const terms = dictionary.terms.map(row => Object.fromEntries(dictionary.schema.map((key, i) => [key, row[i]])));
const sha256 = data => crypto.createHash('sha256').update(data).digest('hex');

function verifyArtwork() {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/medlex-anatomy-artwork.json'), 'utf8'));
  if (dictionary.status !== 'draft_for_clinical_review' || manifest.status !== dictionary.status) {
    throw Error('Clinical review status must be preserved.');
  }
  if (manifest.category !== '02' || manifest.artwork.length !== terms.length) {
    throw Error('Artwork manifest must cover every chapter 02 term.');
  }
  const entries = new Map(manifest.artwork.map(art => [art.id, art]));
  if (entries.size !== terms.length) throw Error('Duplicate artwork identifiers.');
  for (const term of terms) {
    const art = entries.get(term.id);
    if (!art || art.image !== term.id + '.webp') throw Error('Missing artwork: ' + term.id);
    const file = fs.readFileSync(path.join(ROOT, 'assets/medlex-anatomy', art.image));
    if (sha256(file) !== art.sha256 || file.length !== art.bytes) {
      throw Error('Changed or corrupt artwork: ' + term.id);
    }
    if (sha256(term.example) !== art.exampleSha256) {
      throw Error('Clinical example differs from the image: ' + term.id);
    }
    if (art.width !== art.height || art.width < 1000) throw Error('Invalid image size: ' + term.id);
  }
  console.log('MedLex: all ' + terms.length + ' replacement anatomy cards and clinical examples verified.');
}

if (require.main === module) {
  try { verifyArtwork(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { verifyArtwork, terms };

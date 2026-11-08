'use strict';
const baseCatalog = require('../data/medlex-chapters.json');

const QUERY = `{
  "chapters": *[_type == "medlexChapter"] | order(order asc){externalId,title,heading,description},
  "subchapters": *[_type == "medlexSubchapter"] | order(order asc){externalId,groupId,title,order,"chapter":chapter->externalId},
  "cards": *[_type == "medlexCard"] | order(order asc){externalId,term,english,latin,aliases,definition,example,contentStatus,clinicalStatus,order,references,artworkVersion,
    "subchapter":subchapter->{groupId,"chapter":chapter->externalId},
    "imageUrl":image.asset->url}
}`;
const text = (value, max = 500) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const isNewChapter = value => /^(?:0[3-9]|1[0-9]|20)$/.test(value);
const imageUrl = value => /^https:\/\/cdn\.sanity\.io\/images\/4wdtp8cz\/production\/[a-z0-9]+-\d+x\d+\.(?:webp|png|jpg|jpeg)$/.test(value || '') ? value : '';

function mergeCatalog(remote = {}) {
  const catalog = structuredClone(baseCatalog);
  for (const chapter of catalog.categories.filter(item => isNewChapter(item.id))) {
    const metadata = (remote.chapters || []).find(item => item.externalId === chapter.id);
    for (const key of ['title', 'heading', 'description']) if (text(metadata?.[key])) chapter[key] = text(metadata[key]);
    const groups = (remote.subchapters || []).filter(item => item.chapter === chapter.id && /^[a-z0-9-]{1,80}$/.test(item.groupId) && text(item.title));
    const groupOrder = new Map(chapter.groups.map((item, index) => [item.id, index]));
    for (const group of groups) {
      const existing = chapter.groups.find(item => item.id === group.groupId);
      if (existing) existing.label = text(group.title);
      else chapter.groups.push({id:group.groupId, label:text(group.title)});
      if (Number.isFinite(group.order)) groupOrder.set(group.groupId, group.order);
    }
    chapter.groups.sort((a, b) => (groupOrder.get(a.id) ?? 10000) - (groupOrder.get(b.id) ?? 10000));
    const terms = new Map(chapter.terms.map(item => [item.id, item]));
    const termOrder = new Map(chapter.terms.map((item, index) => [item.id, index]));
    for (const row of (remote.cards || []).filter(item => item.subchapter?.chapter === chapter.id)) {
      const id = text(row.externalId, 20);
      const group = row.subchapter.groupId;
      if (!new RegExp('^c' + chapter.id + '-\\d{3}$').test(id) || !chapter.groups.some(item => item.id === group) || !text(row.term, 150)) continue;
      if (!['planned', 'available'].includes(row.contentStatus)) continue;
      const illustration = imageUrl(row.imageUrl);
      if (row.contentStatus === 'available' && (!text(row.definition) || !text(row.example) || !illustration)) continue;
      if (Number.isFinite(row.order)) termOrder.set(id, row.order);
      terms.set(id, {...terms.get(id), id, category:chapter.id, group, term:text(row.term, 150),
        english:text(row.english, 150), latin:text(row.latin, 150), aliases:text(row.aliases),
        definition:text(row.definition), example:text(row.example), status:row.contentStatus,
        imageUrl:illustration, artworkVersion:text(row.artworkVersion, 100),
        clinicalStatus:['draft', 'review', 'verified'].includes(row.clinicalStatus) ? row.clinicalStatus : 'draft',
        references:(row.references || []).filter(value => /^https:\/\//.test(value)).slice(0, 20),
      });
    }
    chapter.terms = [...terms.values()].sort((a, b) => (termOrder.get(a.id) ?? 10000) - (termOrder.get(b.id) ?? 10000) || a.id.localeCompare(b.id));
    const ready = chapter.terms.filter(item => item.status === 'available').length;
    chapter.status = ready === 0 ? 'planned' : ready === chapter.terms.length ? 'available' : 'partial';
  }
  return catalog;
}

let cached;
let cachedAt = 0;
async function readCatalog(querySanity) {
  if (cached && Date.now() - cachedAt < 20000) return cached;
  const remote = await querySanity(QUERY);
  cached = mergeCatalog(remote || {});
  cachedAt = Date.now();
  return cached;
}
module.exports = {QUERY, mergeCatalog, readCatalog, imageUrl};

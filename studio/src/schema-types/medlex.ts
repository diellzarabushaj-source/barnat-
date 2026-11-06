import {DocumentTextIcon} from '@sanity/icons/DocumentText'
import {defineArrayMember, defineField, defineType} from 'sanity'

const orderField = defineField({name: 'order', title: 'Renditja', type: 'number', validation: rule => rule.required().integer().min(0)})
const externalId = defineField({name: 'externalId', title: 'Kodi i kartelës / ndarjes', type: 'string', readOnly: ({value}) => Boolean(value), validation: rule => rule.required()})
const orderings = [{title: 'Sipas rendit', name: 'byOrder', by: [{field: 'order', direction: 'asc' as const}]}]

export const medlexChapter = defineType({
  name: 'medlexChapter', title: 'MedLex · Kapitull', type: 'document', icon: DocumentTextIcon,
  fields: [externalId, orderField,
    defineField({name: 'title', title: 'Titulli', type: 'string', validation: rule => rule.required()}),
    defineField({name: 'heading', title: 'Titulli i faqes', type: 'string'}),
    defineField({name: 'description', title: 'Përshkrimi', type: 'text', rows: 3}),
  ], orderings,
  preview: {select: {title: 'title', code: 'externalId'}, prepare: ({title, code}) => ({title: `${code} · ${title}`})},
})

export const medlexSubchapter = defineType({
  name: 'medlexSubchapter', title: 'MedLex · Nënkapitull', type: 'document', icon: DocumentTextIcon,
  fields: [externalId, orderField,
    defineField({name: 'chapter', title: 'Kapitulli', type: 'reference', to: [{type: 'medlexChapter'}], validation: rule => rule.required()}),
    defineField({name: 'groupId', title: 'Kodi i nënkapitullit', type: 'string', validation: rule => rule.required().regex(/^[a-z0-9-]+$/)}),
    defineField({name: 'title', title: 'Titulli', type: 'string', validation: rule => rule.required()}),
  ], orderings,
  preview: {select: {title: 'title', chapter: 'chapter.title'}, prepare: ({title, chapter}) => ({title, subtitle: chapter})},
})

export const medlexCard = defineType({
  name: 'medlexCard', title: 'MedLex · Kartelë', type: 'document', icon: DocumentTextIcon,
  groups: [{name: 'content', title: 'Kartela', default: true}, {name: 'image', title: 'Fotografia'}, {name: 'review', title: 'Burimet dhe rishikimi'}],
  fields: [
    {...externalId, group: 'content'}, {...orderField, group: 'content'},
    defineField({name: 'subchapter', title: 'Nënkapitulli', type: 'reference', to: [{type: 'medlexSubchapter'}], group: 'content', validation: rule => rule.required()}),
    defineField({name: 'term', title: 'Termi', type: 'string', group: 'content', validation: rule => rule.required()}),
    defineField({name: 'english', title: 'Termi në anglisht', type: 'string', group: 'content'}),
    defineField({name: 'latin', title: 'Termi në latinisht', type: 'string', group: 'content'}),
    defineField({name: 'aliases', title: 'Emra të tjerë për kërkim', type: 'string', group: 'content'}),
    defineField({name: 'definition', title: 'Përkufizimi', type: 'text', rows: 3, group: 'content',
      description: 'Kur ndryshon tekstin e fotografisë, përditëso edhe fotografinë.',
      validation: rule => rule.custom((value, context) => context.document?.contentStatus === 'available' && !value ? 'Plotëso përkufizimin.' : true)}),
    defineField({name: 'example', title: 'Shembulli klinik', type: 'text', rows: 3, group: 'content',
      validation: rule => rule.custom((value, context) => context.document?.contentStatus === 'available' && !value ? 'Plotëso shembullin klinik.' : true)}),
    defineField({name: 'contentStatus', title: 'Plotësimi', type: 'string', group: 'content', initialValue: 'planned',
      options: {layout: 'radio', list: [{title: 'Në përgatitje', value: 'planned'}, {title: 'E plotësuar', value: 'available'}]}, validation: rule => rule.required()}),
    defineField({name: 'image', title: 'Fotografia e kartelës', type: 'image', group: 'image', options: {hotspot: true},
      fields: [defineField({name: 'alt', title: 'Përshkrimi i figurës', type: 'string', validation: rule => rule.required()})],
      validation: rule => rule.custom((value, context) => context.document?.contentStatus === 'available' && !value?.asset ? 'Vendos fotografinë e kartelës.' : true)}),
    defineField({name: 'illustrationBrief', title: 'Çfarë paraqet figura', type: 'text', rows: 4, group: 'image'}),
    defineField({name: 'artworkVersion', title: 'Versioni i figurës', type: 'string', group: 'image'}),
    defineField({name: 'importSource', title: 'Burimi i importit', type: 'string', group: 'image', readOnly: true}),
    ...['sourceSha256', 'imageSha256', 'definitionSha256', 'exampleSha256'].map(name => defineField({name, type: 'string', group: 'image', readOnly: true})),
    defineField({name: 'references', title: 'Burimet', type: 'array', group: 'review',
      of: [defineArrayMember({type: 'url', validation: rule => rule.uri({scheme: ['https']})})]}),
    defineField({name: 'clinicalStatus', title: 'Rishikimi klinik', type: 'string', group: 'review', initialValue: 'draft',
      options: {layout: 'radio', list: [{title: 'Draft', value: 'draft'}, {title: 'Në rishikim', value: 'review'}, {title: 'E verifikuar', value: 'verified'}]}, validation: rule => rule.required()}),
    defineField({name: 'reviewedBy', title: 'Rishikuar nga', type: 'string', group: 'review',
      validation: rule => rule.custom((value, context) => context.document?.clinicalStatus === 'verified' && !value ? 'Vendos emrin e rishikuesit.' : true)}),
    defineField({name: 'reviewedAt', title: 'Data e rishikimit', type: 'date', group: 'review',
      validation: rule => rule.custom((value, context) => context.document?.clinicalStatus === 'verified' && !value ? 'Vendos datën e rishikimit.' : true)}),
  ], orderings,
  preview: {select: {title: 'term', subtitle: 'subchapter.title', media: 'image'}},
})

export const medlexTemplates = [
  {id: 'medlex-subchapter-in-chapter', title: 'Nënkapitull MedLex', schemaType: 'medlexSubchapter',
    parameters: [{name: 'chapterId', type: 'string'}], value: ({chapterId}: {chapterId: string}) => ({chapter: {_type: 'reference', _ref: chapterId.replace(/^drafts\./, '')}})},
  {id: 'medlex-card-in-subchapter', title: 'Kartelë MedLex', schemaType: 'medlexCard',
    parameters: [{name: 'subchapterId', type: 'string'}], value: ({subchapterId}: {subchapterId: string}) => ({subchapter: {_type: 'reference', _ref: subchapterId.replace(/^drafts\./, '')}, contentStatus: 'planned', clinicalStatus: 'draft'})},
]

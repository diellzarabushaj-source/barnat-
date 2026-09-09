import {DocumentTextIcon} from '@sanity/icons/DocumentText'
import {defineArrayMember, defineField, defineType} from 'sanity'

export const medicalTopic = defineType({
  name: 'medicalTopic',
  title: 'Temë / nënkapitull',
  type: 'document',
  icon: DocumentTextIcon,
  groups: [
    {name: 'structure', title: 'Struktura', default: true},
    {name: 'content', title: 'Përmbajtja'},
    {name: 'indexing', title: 'Kërkimi dhe lidhjet'},
    {name: 'source', title: 'Burimi'},
    {name: 'workflow', title: 'Rishikimi'},
  ],
  fields: [
    defineField({name: 'schemaVersion', title: 'Versioni i strukturës', type: 'number', initialValue: 2, hidden: true}),
    defineField({name: 'language', title: 'Gjuha e mësimit', type: 'string', group: 'structure', initialValue: 'sq', options: {list: [{title: 'Shqip', value: 'sq'}, {title: 'Anglisht', value: 'en'}]}}),
    defineField({name: 'book', title: 'Libri', type: 'reference', to: [{type: 'medicalBook'}], group: 'structure', validation: (rule) => rule.required()}),
    defineField({name: 'chapter', title: 'Kapitulli', type: 'reference', to: [{type: 'medicalChapter'}], group: 'structure', options: {filter: ({document}) => ({filter: 'book._ref == $bookId', params: {bookId: (document.book as {_ref?: string})?._ref || ''}})}, validation: rule => rule.required().custom(async (value, context) => {
      const bookId = (context.document?.book as {_ref?: string})?._ref
      if (!value?._ref || !bookId) return true
      const chapterBook = await context.getClient({apiVersion: '2026-08-30'}).withConfig({perspective: 'raw'}).fetch<string | null>('coalesce(*[_id == $draftId][0].book._ref, *[_id == $id][0].book._ref)', {id: value._ref, draftId: `drafts.${value._ref}`})
      return chapterBook === bookId || 'Kapitulli duhet t’i përkasë librit të zgjedhur.'
    })}),
    defineField({name: 'parentTopic', title: 'Tema prind (opsionale)', type: 'reference', to: [{type: 'medicalTopic'}], group: 'structure'}),
    defineField({name: 'title', title: 'Titulli', type: 'string', group: 'structure', validation: (rule) => rule.required()}),
    defineField({name: 'originalTitle', title: 'Titulli origjinal', type: 'string', group: 'structure'}),
    defineField({name: 'slug', title: 'Slug', type: 'slug', group: 'structure', options: {source: 'title'}, validation: (rule) => rule.required()}),
    defineField({
      name: 'topicType',
      title: 'Lloji',
      type: 'string',
      group: 'structure',
      options: {layout: 'radio', list: [
        {title: 'Temë', value: 'topic'},
        {title: 'Nënkapitull', value: 'subtopic'},
        {title: 'Shtojcë', value: 'appendix'},
      ]},
      initialValue: 'topic',
      validation: (rule) => rule.required(),
    }),
    defineField({name: 'order', title: 'Renditja në kapitull', type: 'number', group: 'structure', validation: (rule) => rule.required().integer().positive()}),
    defineField({name: 'summary', title: 'Përmbledhja e shpejtë', type: 'text', rows: 5, group: 'content'}),
    defineField({
      name: 'sections',
      title: 'Seksionet',
      description: 'Rendi këtu është rendi i leximit. Çdo mësim mund të ketë strukturë të ndryshme; përdor menunë Shto për blloqet.',
      type: 'array',
      group: 'content',
      of: [defineArrayMember({type: 'medicalSection'})],
      validation: (rule) => rule.required().min(1),
    }),
    defineField({name: 'keywords', title: 'Fjalë kyçe', type: 'array', group: 'indexing', of: [{type: 'string'}], options: {layout: 'tags'}, validation: (rule) => rule.unique()}),
    defineField({name: 'icdCodes', title: 'Kodet ICD-10', type: 'array', group: 'indexing', of: [{type: 'string'}], options: {layout: 'tags'}, validation: (rule) => rule.unique()}),
    defineField({name: 'procedureCodes', title: 'Kodet e procedurave', type: 'array', group: 'indexing', of: [{type: 'string'}], options: {layout: 'tags'}, validation: (rule) => rule.unique()}),
    defineField({name: 'relatedTopics', title: 'Tema të lidhura', type: 'array', group: 'indexing', of: [defineArrayMember({type: 'reference', to: [{type: 'medicalTopic'}]})], validation: (rule) => rule.unique()}),
    defineField({name: 'sourceLocator', title: 'Vendndodhja e temës në libër', type: 'sourceLocator', group: 'source'}),
    defineField({name: 'sources', title: 'Referenca shtesë', type: 'array', group: 'source', of: [defineArrayMember({type: 'sourceCitation'})]}),
    defineField({
      name: 'reviewStatus',
      title: 'Statusi klinik',
      type: 'string',
      group: 'workflow',
      options: {layout: 'radio', list: [
        {title: 'Draft', value: 'draft'},
        {title: 'Në rishikim', value: 'review'},
        {title: 'I verifikuar', value: 'verified'},
        {title: 'I arkivuar', value: 'archived'},
      ]},
      initialValue: 'draft',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'reviewedBy',
      title: 'Rishikuar nga',
      type: 'string',
      group: 'workflow',
      validation: (rule) => rule.custom((value, context) =>
        context.document?.reviewStatus === 'verified' && !value
          ? 'Shëno personin që e ka verifikuar para publikimit klinik.'
          : true),
    }),
    defineField({
      name: 'lastReviewedAt',
      title: 'Rishikimi i fundit',
      type: 'date',
      group: 'workflow',
      validation: (rule) => rule.custom((value, context) =>
        context.document?.reviewStatus === 'verified' && !value
          ? 'Vendos datën e verifikimit para publikimit klinik.'
          : true),
    }),
    defineField({name: 'version', title: 'Versioni editorial', type: 'string', group: 'workflow'}),
    defineField({name: 'editorialNotes', title: 'Shënime të brendshme', type: 'text', rows: 4, group: 'workflow'}),
  ],
  orderings: [{title: 'Sipas kapitullit', name: 'chapterOrder', by: [{field: 'order', direction: 'asc'}]}],
  preview: {
    select: {title: 'title', order: 'order', chapter: 'chapter.title', status: 'reviewStatus'},
    prepare: ({title, order, chapter, status}) => ({
      title: order ? `${order}. ${title}` : title,
      subtitle: [chapter, status].filter(Boolean).join(' · '),
    }),
  },
})

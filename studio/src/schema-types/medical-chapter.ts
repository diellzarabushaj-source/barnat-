import {DocumentTextIcon} from '@sanity/icons/DocumentText'
import {defineField, defineType} from 'sanity'

export const medicalChapter = defineType({
  name: 'medicalChapter',
  title: 'Kapitull',
  type: 'document',
  icon: DocumentTextIcon,
  groups: [
    {name: 'structure', title: 'Struktura', default: true},
    {name: 'source', title: 'Burimi'},
    {name: 'workflow', title: 'Rishikimi'},
  ],
  fields: [
    defineField({name: 'book', title: 'Libri', type: 'reference', to: [{type: 'medicalBook'}], group: 'structure', validation: (rule) => rule.required()}),
    defineField({name: 'number', title: 'Numri i kapitullit', type: 'number', group: 'structure', validation: (rule) => rule.required().integer().positive()}),
    defineField({name: 'title', title: 'Titulli', type: 'string', group: 'structure', validation: (rule) => rule.required()}),
    defineField({name: 'originalTitle', title: 'Titulli origjinal', type: 'string', group: 'structure'}),
    defineField({name: 'slug', title: 'Slug', type: 'slug', group: 'structure', options: {source: 'title'}, validation: (rule) => rule.required()}),
    defineField({name: 'order', title: 'Renditja', type: 'number', group: 'structure', validation: (rule) => rule.required().integer().positive()}),
    defineField({name: 'summary', title: 'Përmbledhje', type: 'text', rows: 4, group: 'structure'}),
    defineField({name: 'sourceLocator', title: 'Vendndodhja në libër', type: 'sourceLocator', group: 'source'}),
    defineField({
      name: 'reviewStatus',
      title: 'Statusi',
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
    defineField({name: 'version', title: 'Versioni editorial', type: 'string', group: 'workflow'}),
  ],
  orderings: [{title: 'Sipas librit', name: 'bookOrder', by: [{field: 'order', direction: 'asc'}]}],
  preview: {
    select: {title: 'title', number: 'number', book: 'book.shortTitle', status: 'reviewStatus'},
    prepare: ({title, number, book, status}) => ({
      title: number ? `${number}. ${title}` : title,
      subtitle: [book, status].filter(Boolean).join(' · '),
    }),
  },
})

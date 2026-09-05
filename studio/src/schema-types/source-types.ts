import {defineField, defineType} from 'sanity'

export const sourceFile = defineType({
  name: 'sourceFile',
  title: 'Skedari burimor',
  type: 'object',
  fields: [
    defineField({
      name: 'driveFileId',
      title: 'Google Drive file ID',
      type: 'string',
      description: 'ID-ja e skedarit, jo lidhja e plotë.',
    }),
    defineField({
      name: 'url',
      title: 'Lidhja e skedarit',
      type: 'url',
      validation: (rule) => rule.uri({scheme: ['https']}),
    }),
    defineField({name: 'fileName', title: 'Emri i skedarit', type: 'string'}),
    defineField({name: 'revisionId', title: 'Revision ID', type: 'string'}),
    defineField({
      name: 'totalPages',
      title: 'Numri i faqeve',
      type: 'number',
      validation: (rule) => rule.integer().positive(),
    }),
    defineField({name: 'checkedAt', title: 'Kontrolluar më', type: 'datetime'}),
    defineField({name: 'checksum', title: 'Checksum', type: 'string'}),
  ],
  preview: {
    select: {title: 'fileName', subtitle: 'driveFileId'},
  },
})

export const sourceLocator = defineType({
  name: 'sourceLocator',
  title: 'Vendndodhja në burim',
  type: 'object',
  fields: [
    defineField({
      name: 'pageStart',
      title: 'Faqja filluese',
      type: 'number',
      validation: (rule) => rule.integer().positive(),
    }),
    defineField({
      name: 'pageEnd',
      title: 'Faqja përfundimtare',
      type: 'number',
      validation: (rule) => rule.integer().positive(),
    }),
    defineField({
      name: 'headingPath',
      title: 'Rruga e titujve',
      description: 'P.sh. Kapitulli 6 → Astma → Trajtimi.',
      type: 'array',
      of: [{type: 'string'}],
    }),
    defineField({
      name: 'paragraphStart',
      title: 'Paragrafi fillues',
      type: 'number',
      validation: (rule) => rule.integer().positive(),
    }),
    defineField({
      name: 'paragraphEnd',
      title: 'Paragrafi përfundimtar',
      type: 'number',
      validation: (rule) => rule.integer().positive(),
    }),
    defineField({name: 'sourceNote', title: 'Shënim për burimin', type: 'text', rows: 3}),
  ],
})

export const sourceCitation = defineType({
  name: 'sourceCitation',
  title: 'Referencë',
  type: 'object',
  fields: [
    defineField({name: 'title', title: 'Titulli', type: 'string', validation: (rule) => rule.required()}),
    defineField({name: 'organization', title: 'Autor / organizatë', type: 'string'}),
    defineField({name: 'url', title: 'Lidhja', type: 'url', validation: (rule) => rule.uri({scheme: ['https']})}),
    defineField({name: 'publishedAt', title: 'Data e publikimit', type: 'date'}),
    defineField({name: 'note', title: 'Shënim', type: 'text', rows: 3}),
    defineField({name: 'locator', title: 'Vendndodhja në burim', type: 'sourceLocator'}),
  ],
  preview: {
    select: {title: 'title', subtitle: 'organization'},
  },
})

export const sourceExtract = defineType({
  name: 'sourceExtract',
  title: 'Ekstrakt i librit',
  type: 'object',
  fields: [
    defineField({name: 'label', title: 'Emri', type: 'string', validation: (rule) => rule.required()}),
    defineField({
      name: 'kind',
      title: 'Lloji',
      type: 'string',
      options: {list: [
        {title: 'Ekstrakt recetash', value: 'prescriptions'},
        {title: 'Shënime pune', value: 'workingNotes'},
        {title: 'Tjetër', value: 'other'},
      ]},
      initialValue: 'prescriptions',
      validation: (rule) => rule.required(),
    }),
    defineField({name: 'file', title: 'Dokumenti në Google Drive', type: 'sourceFile', validation: (rule) => rule.required()}),
    defineField({
      name: 'relationship',
      title: 'Marrëdhënia me librin',
      type: 'string',
      initialValue: 'derived',
      options: {layout: 'radio', list: [
        {title: 'I nxjerrë nga libri', value: 'derived'},
        {title: 'Referencë shtesë', value: 'supplemental'},
      ]},
      validation: (rule) => rule.required(),
    }),
    defineField({name: 'note', title: 'Shënim editorial', type: 'text', rows: 3}),
  ],
  preview: {select: {title: 'label', subtitle: 'file.fileName'}},
})

import {DocumentTextIcon} from '@sanity/icons/DocumentText'
import {defineArrayMember, defineField, defineType} from 'sanity'
import {legacyMigrationField} from './legacy-migration'

// This existing deployed type remains available alongside the new MedLex types.
export const medicalPrescription = defineType({
  name: 'medicalPrescription', title: 'Recetë e librit', type: 'document', icon: DocumentTextIcon,
  description: 'Ekstrakt Rx i lidhur me librin kryesor; kërkon verifikim klinik para publikimit.',
  groups: [{name: 'structure', title: 'Lidhja me librin', default: true}, {name: 'content', title: 'Receta'}, {name: 'source', title: 'Burimi'}, {name: 'workflow', title: 'Rishikimi'}],
  fields: [
    defineField({name: 'book', title: 'Libri', type: 'reference', to: [{type: 'medicalBook'}], group: 'structure', validation: rule => rule.required()}),
    defineField({name: 'chapter', title: 'Kapitulli', type: 'reference', to: [{type: 'medicalChapter'}], group: 'structure', validation: rule => rule.required()}),
    defineField({name: 'topic', title: 'Tema (opsionale)', type: 'reference', to: [{type: 'medicalTopic'}], group: 'structure'}),
    defineField({name: 'title', title: 'Titulli', type: 'string', group: 'structure', validation: rule => rule.required()}),
    defineField({name: 'slug', type: 'slug', group: 'structure', options: {source: 'title'}, validation: rule => rule.required()}),
    defineField({name: 'order', title: 'Renditja në kapitull', type: 'number', group: 'structure', validation: rule => rule.required().integer().min(0)}),
    defineField({name: 'applicability', title: 'Kur përdoret', type: 'text', rows: 4, group: 'content'}),
    defineField({name: 'groups', title: 'Box-et e recetës / terapisë', type: 'array', group: 'content', of: [defineArrayMember({type: 'prescriptionGroup'})], validation: rule => rule.required().min(1)}),
    defineField({name: 'keywords', title: 'Fjalë kyçe', type: 'array', group: 'content', of: [defineArrayMember({type: 'string'})], options: {layout: 'tags'}, validation: rule => rule.unique()}),
    defineField({name: 'sourceExtract', title: 'Dokumenti i ekstraktit', type: 'sourceFile', group: 'source', validation: rule => rule.required()}),
    defineField({name: 'sourceHeading', title: 'Titulli në ekstrakt', type: 'string', group: 'source', validation: rule => rule.required()}),
    defineField({name: 'sourceLocator', title: 'Vendndodhja në librin kryesor', type: 'sourceLocator', group: 'source'}),
    legacyMigrationField,
    defineField({name: 'reviewStatus', title: 'Statusi klinik', type: 'string', group: 'workflow', initialValue: 'draft',
      options: {layout: 'radio', list: [{title: 'Draft', value: 'draft'}, {title: 'Në rishikim', value: 'review'}, {title: 'I verifikuar', value: 'verified'}, {title: 'I arkivuar', value: 'archived'}]}, validation: rule => rule.required()}),
    defineField({name: 'reviewedBy', title: 'Rishikuar nga', type: 'string', group: 'workflow',
      validation: rule => rule.custom((value, context) => context.document?.reviewStatus === 'verified' && !value ? 'Vendos emrin e rishikuesit.' : true)}),
    defineField({name: 'lastReviewedAt', title: 'Rishikimi i fundit', type: 'date', group: 'workflow',
      validation: rule => rule.custom((value, context) => context.document?.reviewStatus === 'verified' && !value ? 'Vendos datën e rishikimit.' : true)}),
    defineField({name: 'version', title: 'Versioni editorial', type: 'string', group: 'workflow'}),
    defineField({name: 'editorialNotes', title: 'Shënime të brendshme', type: 'text', rows: 4, group: 'workflow'}),
  ],
  orderings: [{title: 'Sipas kapitullit', name: 'chapterOrder', by: [{field: 'chapter._ref', direction: 'asc'}, {field: 'order', direction: 'asc'}]}],
  preview: {select: {title: 'title', subtitle: 'chapter.title'}},
})

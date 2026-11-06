import {DocumentTextIcon} from '@sanity/icons/DocumentText'
import {defineArrayMember, defineField, defineType} from 'sanity'

// Preserve the provenance already present in the deployed authoring schema.
export const legacyMigrationProvenance = defineType({
  name: 'legacyMigrationProvenance', title: 'Provenienca e migrimit legacy', type: 'object', icon: DocumentTextIcon,
  fields: [
    defineField({name: 'sourceDocumentId', title: 'ID-ja e dokumentit burimor', type: 'string', readOnly: true, validation: rule => rule.required()}),
    defineField({name: 'sourceDocumentType', title: 'Tipi i dokumentit burimor', type: 'string', readOnly: true,
      options: {list: ['learningTopic', 'prescriptionGuide']}, validation: rule => rule.required()}),
    defineField({name: 'sourceReviewStatus', title: 'Statusi para migrimit', type: 'string', readOnly: true}),
    defineField({name: 'migrationVersion', title: 'Versioni i migrimit', type: 'string', readOnly: true, validation: rule => rule.required()}),
    defineField({name: 'migratedAt', title: 'Migruar më', type: 'datetime', readOnly: true, validation: rule => rule.required()}),
    defineField({name: 'sourceFields', title: 'Fushat legacy të bartura', type: 'array', readOnly: true, of: [defineArrayMember({type: 'string'})]}),
    defineField({name: 'note', title: 'Shënim i migrimit', type: 'text', rows: 3, readOnly: true}),
  ],
})

export const legacyMigrationField = defineField({name: 'legacyMigration', title: 'Provenienca legacy', type: 'legacyMigrationProvenance', group: 'source', readOnly: true})

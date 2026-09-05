import {defineArrayMember, defineField, defineType} from 'sanity'

import {portableText} from './clinical-types'

export const medicalSection = defineType({
  name: 'medicalSection',
  title: 'Seksion i temës',
  type: 'object',
  fields: [
    defineField({name: 'title', title: 'Titulli', type: 'string', validation: (rule) => rule.required()}),
    defineField({name: 'slug', title: 'Anchor', type: 'slug', options: {source: 'title'}, validation: (rule) => rule.required()}),
    defineField({name: 'order', title: 'Renditja', type: 'number', validation: (rule) => rule.integer().positive()}),
    defineField({
      name: 'sectionType',
      title: 'Lloji i seksionit',
      type: 'string',
      options: {list: [
        {title: 'Përmbledhje', value: 'overview'},
        {title: 'Vlerësim', value: 'assessment'},
        {title: 'Diagnozë', value: 'diagnosis'},
        {title: 'Trajtim', value: 'treatment'},
        {title: 'Procedurë', value: 'procedure'},
        {title: 'Recetë', value: 'prescription'},
        {title: 'Urgjencë', value: 'emergency'},
        {title: 'Referim', value: 'referral'},
        {title: 'Ndjekje', value: 'followup'},
        {title: 'Referencë', value: 'reference'},
      ]},
      initialValue: 'overview',
      validation: (rule) => rule.required(),
    }),
    defineField({name: 'summary', title: 'Përmbledhje e seksionit', type: 'text', rows: 3}),
    defineField({name: 'sourceLocator', title: 'Vendndodhja në burim', type: 'sourceLocator'}),
    defineField({
      name: 'content',
      title: 'Përmbajtja',
      type: 'array',
      of: [
        portableText,
        defineArrayMember({type: 'clinicalCallout'}),
        defineArrayMember({type: 'clinicalStepGroup'}),
        defineArrayMember({type: 'prescriptionGroup'}),
        defineArrayMember({type: 'medicalFigure'}),
        defineArrayMember({type: 'medicalTable'}),
      ],
      validation: (rule) => rule.required().min(1),
    }),
  ],
  preview: {
    select: {title: 'title', order: 'order', subtitle: 'summary'},
    prepare: ({title, order, subtitle}) => ({
      title: order ? `${order}. ${title}` : title,
      subtitle,
    }),
  },
})

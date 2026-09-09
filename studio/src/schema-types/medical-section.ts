import {defineArrayMember, defineField, defineType} from 'sanity'

import {contentMembers, contentOptions} from './learning-blocks'

export const medicalSection = defineType({
  name: 'medicalSection',
  title: 'Seksion i mësimit',
  type: 'object',
  fields: [
    defineField({name: 'title', title: 'Titulli', type: 'string', validation: (rule) => rule.required()}),
    defineField({name: 'slug', title: 'Anchor', type: 'slug', options: {source: 'title'}, description: 'Opsionale. Lidhja e lexuesit përdor identitetin e seksionit.'}),
    defineField({name: 'order', title: 'Renditja e vjetër', type: 'number', readOnly: true, hidden: ({value}) => value === undefined, deprecated: {reason: 'Zhvendos seksionin në listë për të ndryshuar renditjen.'}}),
    defineField({
      name: 'sectionType',
      title: 'Lloji i seksionit',
      type: 'string',
      options: {list: [
        {title: 'Përmbajtje e lirë', value: 'general'},
        {title: 'Anamnezë', value: 'history'},
        {title: 'Ekzaminim', value: 'examination'},
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
      initialValue: 'general',
      validation: (rule) => rule.required(),
    }),
    defineField({name: 'summary', title: 'Përmbledhje e seksionit', type: 'text', rows: 3}),
    defineField({name: 'sourceLocator', title: 'Vendndodhja në burim', type: 'sourceLocator'}),
    defineField({
      name: 'content',
      title: 'Përmbajtja',
      type: 'array',
      description: 'Shto tekst, tabela, pyetje, receta ose nënndarje. Zhvendosi lirisht në rendin e dëshiruar.',
      options: contentOptions,
      of: [...contentMembers(), defineArrayMember({type: 'medicalSubsection'})],
      validation: (rule) => rule.required().min(1),
    }),
  ],
  preview: {
    select: {title: 'title', subtitle: 'summary'},
    prepare: ({title, subtitle}) => ({
      title,
      subtitle,
    }),
  },
})

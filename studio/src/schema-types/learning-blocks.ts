import {DocumentTextIcon} from '@sanity/icons/DocumentText'
import {defineArrayMember, defineField, defineType} from 'sanity'
import {portableText} from './clinical-types'

// One shared vocabulary for every chapter; array position is the reading order.
export const contentMembers = () => [
  portableText,
  ...['clinicalCallout', 'clinicalStepGroup', 'prescriptionGroup', 'medicalFigure', 'medicalTable',
    'medicalChecklist', 'medicalQuestionSet', 'medicalDecision'].map(type => defineArrayMember({type})),
]
export const contentOptions = {
  insertMenu: {
    filter: true,
    groups: [
      {name: 'learning', title: 'Mësimi', of: ['medicalSubsection', 'medicalChecklist', 'medicalQuestionSet', 'medicalTable', 'medicalFigure']},
      {name: 'clinical', title: 'Praktika klinike', of: ['clinicalStepGroup', 'clinicalCallout', 'prescriptionGroup', 'medicalDecision']},
    ],
  },
}
const title = () => defineField({name: 'title', title: 'Titulli', type: 'string', validation: rule => rule.required()})
const locator = () => defineField({name: 'sourceLocator', title: 'Faqja dhe pjesa e burimit', type: 'sourceLocator'})

export const medicalSubsection = defineType({
  name: 'medicalSubsection', title: 'Nënndarje e mësimit', type: 'object', icon: DocumentTextIcon,
  fields: [title(), defineField({name: 'summary', title: 'Hyrja', type: 'text', rows: 2}),
    defineField({name: 'content', title: 'Blloqet në rendin e leximit', type: 'array', of: contentMembers(), options: contentOptions, validation: rule => rule.required().min(1)}), locator()],
  preview: {select: {title: 'title'}, prepare: ({title}) => ({title, subtitle: 'Nënndarje · blloqe të lëvizshme'})},
})
export const medicalChecklist = defineType({
  name: 'medicalChecklist', title: 'Listë kontrolli / ekzaminimi', type: 'object', icon: DocumentTextIcon,
  fields: [title(), defineField({name: 'items', title: 'Pikat', type: 'array', validation: rule => rule.required().min(1), of: [defineArrayMember({
    name: 'medicalCheckItem', title: 'Pikë kontrolli', type: 'object', fields: [
      defineField({name: 'label', title: 'Çfarë kontrollohet', type: 'string', validation: rule => rule.required()}),
      defineField({name: 'detail', title: 'Shpjegimi', type: 'text', rows: 3}),
    ], preview: {select: {title: 'label', subtitle: 'detail'}},
  })]}), locator()], preview: {select: {title: 'title'}},
})
export const medicalQuestionSet = defineType({
  name: 'medicalQuestionSet', title: 'Pyetje dhe shpjegime', type: 'object', icon: DocumentTextIcon,
  fields: [title(), defineField({name: 'items', title: 'Pyetjet', type: 'array', validation: rule => rule.required().min(1), of: [defineArrayMember({
    name: 'medicalQuestion', title: 'Pyetje', type: 'object', fields: [
      defineField({name: 'question', title: 'Pyetja në shqip', type: 'string', validation: rule => rule.required()}),
      defineField({name: 'answer', title: 'Shpjegimi / çfarë dokumentohet', type: 'array', of: [portableText], validation: rule => rule.required().min(1)}),
    ], preview: {select: {title: 'question'}},
  })]}), locator()], preview: {select: {title: 'title'}},
})
export const medicalDecision = defineType({
  name: 'medicalDecision', title: 'Vendimmarrje: nëse → atëherë', type: 'object', icon: DocumentTextIcon,
  fields: [title(), defineField({name: 'branches', title: 'Kushtet dhe veprimet', type: 'array', validation: rule => rule.required().min(1), of: [defineArrayMember({
    name: 'medicalDecisionBranch', title: 'Kusht dhe veprim', type: 'object', fields: [
      defineField({name: 'condition', title: 'Nëse', type: 'text', rows: 2, validation: rule => rule.required()}),
      defineField({name: 'action', title: 'Atëherë', type: 'array', of: [portableText], validation: rule => rule.required().min(1)}),
    ], preview: {select: {title: 'condition'}},
  })]}), locator()], preview: {select: {title: 'title'}},
})

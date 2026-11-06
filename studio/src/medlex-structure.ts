import {DocumentTextIcon} from '@sanity/icons/DocumentText'
import type {StructureBuilder} from 'sanity/structure'

export const medlexStructure = (S: StructureBuilder) => S.listItem()
  .title('MedLex · Kapitull → Nënkapitull → Kartelat').icon(DocumentTextIcon)
  .child(S.documentTypeList('medlexChapter').title('Kapitujt MedLex')
    .defaultOrdering([{field: 'order', direction: 'asc'}])
    .child(chapterId => S.documentList().title('Nënkapitujt').schemaType('medlexSubchapter')
      .filter('_type == "medlexSubchapter" && chapter._ref == $chapterId')
      .params({chapterId: chapterId.replace(/^drafts\./, '')})
      .defaultOrdering([{field: 'order', direction: 'asc'}])
      .initialValueTemplates([S.initialValueTemplateItem('medlex-subchapter-in-chapter', {chapterId})])
      .child(subchapterId => S.documentList().title('Kartelat').schemaType('medlexCard')
        .filter('_type == "medlexCard" && subchapter._ref == $subchapterId')
        .params({subchapterId: subchapterId.replace(/^drafts\./, '')})
        .defaultOrdering([{field: 'order', direction: 'asc'}])
        .initialValueTemplates([S.initialValueTemplateItem('medlex-card-in-subchapter', {subchapterId})]))))

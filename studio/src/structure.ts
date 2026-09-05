import {DocumentTextIcon} from '@sanity/icons/DocumentText'
import type {StructureResolver} from 'sanity/structure'

const topicList = (S: Parameters<StructureResolver>[0], title: string, filter: string) =>
  S.listItem()
    .title(title)
    .icon(DocumentTextIcon)
    .child(
      S.documentList()
        .title(title)
        .schemaType('medicalTopic')
        .filter(filter)
        .defaultOrdering([{field: 'order', direction: 'asc'}]),
    )

export const structure: StructureResolver = (S) =>
  S.list()
    .title('Medical Hub')
    .items([
      S.documentTypeListItem('medicalBook').title('Librat').icon(DocumentTextIcon),
      S.documentTypeListItem('medicalChapter').title('Kapitujt').icon(DocumentTextIcon),
      S.documentTypeListItem('medicalTopic').title('Të gjitha temat').icon(DocumentTextIcon),
      S.divider(),
      topicList(S, 'Draftet', '_type == "medicalTopic" && reviewStatus == "draft"'),
      topicList(S, 'Në rishikim', '_type == "medicalTopic" && reviewStatus == "review"'),
      topicList(S, 'Të verifikuara', '_type == "medicalTopic" && reviewStatus == "verified"'),
    ])

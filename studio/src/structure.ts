import {DocumentTextIcon} from '@sanity/icons/DocumentText'
import {chapterTemplate, lessonTemplates} from './lesson-templates'
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
      S.listItem().title('Libër → kapitull → mësim').icon(DocumentTextIcon).child(
        S.documentTypeList('medicalBook').title('Zgjidh librin').child(bookId =>
          S.documentList().title('Kapitujt e librit').schemaType('medicalChapter')
            .filter('_type == "medicalChapter" && book._ref == $bookId').params({bookId})
            .initialValueTemplates([S.initialValueTemplateItem(chapterTemplate.id, {bookId})])
            .defaultOrdering([{field: 'order', direction: 'asc'}])
            .child(chapterId => S.documentList().title('Mësimet e kapitullit').schemaType('medicalTopic')
              .filter('_type == "medicalTopic" && chapter._ref == $chapterId').params({chapterId})
              .defaultOrdering([{field: 'order', direction: 'asc'}])
              .initialValueTemplates(lessonTemplates.map(template => S.initialValueTemplateItem(template.id, {bookId, chapterId}))))
        )
      ),
      S.documentTypeListItem('medicalBook').title('Librat').icon(DocumentTextIcon),
      S.documentTypeListItem('medicalChapter').title('Kapitujt').icon(DocumentTextIcon),
      S.documentTypeListItem('medicalTopic').title('Të gjitha temat').icon(DocumentTextIcon),
      S.divider(),
      topicList(S, 'Draftet', '_type == "medicalTopic" && reviewStatus == "draft"'),
      topicList(S, 'Në rishikim', '_type == "medicalTopic" && reviewStatus == "review"'),
      topicList(S, 'Të verifikuara', '_type == "medicalTopic" && reviewStatus == "verified"'),
    ])

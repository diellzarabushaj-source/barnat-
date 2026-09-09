import type {Template} from 'sanity'

const outlines: Record<string, {title: string, sections: [string, string][]}> = {
  free: {title: 'Mësim me strukturë të lirë', sections: [['Përmbajtja', 'general']]},
  history: {title: 'Anamnezë dhe ekzaminim', sections: [['Qasja ndaj pacientit', 'history'], ['Anamneza', 'history'], ['Ekzaminimi fizik', 'examination']]},
  disease: {title: 'Sëmundje / diagnozë', sections: [['Përkufizimi', 'overview'], ['Paraqitja klinike', 'assessment'], ['Diagnostikimi', 'diagnosis'], ['Trajtimi', 'treatment'], ['Ndjekja', 'followup']]},
  procedure: {title: 'Procedurë', sections: [['Indikacionet', 'overview'], ['Përgatitja', 'assessment'], ['Hapat e procedurës', 'procedure'], ['Kujdesi pas procedurës', 'followup']]},
  emergency: {title: 'Urgjencë', sections: [['Njohja e urgjencës', 'emergency'], ['Vlerësimi fillestar', 'assessment'], ['Veprimet', 'treatment'], ['Referimi', 'referral']]},
}
export const lessonTemplates: Template[] = Object.entries(outlines).map(([key, outline]) => ({
  id: `medical-topic-${key}`, title: outline.title, schemaType: 'medicalTopic',
  description: 'Pikënisje e redaktueshme. Çdo seksion mund të hiqet, shtohet ose zhvendoset.',
  parameters: [{name: 'bookId', type: 'string'}, {name: 'chapterId', type: 'string'}],
  value: (params: {bookId?: string, chapterId?: string} = {}) => ({
    reviewStatus: 'draft', topicType: 'topic', language: 'sq', schemaVersion: 2,
    ...(params.bookId ? {book: {_type: 'reference', _ref: params.bookId}} : {}),
    ...(params.chapterId ? {chapter: {_type: 'reference', _ref: params.chapterId}} : {}),
    sections: outline.sections.map(([title, sectionType], index) => ({
      _type: 'medicalSection', _key: `section-${index}`, title, sectionType, content: [],
    })),
  }),
}))

export const chapterTemplate: Template = {
  id: 'medical-chapter-in-book', title: 'Kapitull në këtë libër', schemaType: 'medicalChapter',
  parameters: [{name: 'bookId', type: 'string'}],
  value: (params: {bookId?: string} = {}) => ({reviewStatus: 'draft',
    ...(params.bookId ? {book: {_type: 'reference', _ref: params.bookId}} : {}),
  }),
}

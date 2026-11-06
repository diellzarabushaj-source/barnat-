import {medicalSubsection, medicalChecklist, medicalQuestionSet, medicalDecision} from './learning-blocks'
import {
  clinicalCallout,
  clinicalStep,
  clinicalStepGroup,
  medicalFigure,
  medicalTable,
  medicalTableCell,
  medicalTableRow,
  prescriptionGroup,
  prescriptionLine,
} from './clinical-types'
import {medicalBook} from './medical-book'
import {medicalChapter} from './medical-chapter'
import {medicalSection} from './medical-section'
import {medicalTopic} from './medical-topic'
import {sourceCitation, sourceExtract, sourceFile, sourceLocator} from './source-types'
import {medlexCard, medlexChapter, medlexSubchapter} from './medlex'
import {legacyMigrationProvenance} from './legacy-migration'
import {medicalPrescription} from './medical-prescription'

export const schemaTypes = [
  medlexChapter, medlexSubchapter, medlexCard,
  legacyMigrationProvenance, medicalPrescription,
  medicalSubsection,
  medicalChecklist,
  medicalQuestionSet,
  medicalDecision,
  sourceFile,
  sourceLocator,
  sourceCitation,
  sourceExtract,
  clinicalCallout,
  clinicalStep,
  clinicalStepGroup,
  prescriptionLine,
  prescriptionGroup,
  medicalFigure,
  medicalTableRow,
  medicalTable,
  medicalTableCell,
  medicalSection,
  medicalBook,
  medicalChapter,
  medicalTopic,
]

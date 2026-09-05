import {
  clinicalCallout,
  clinicalStep,
  clinicalStepGroup,
  medicalFigure,
  medicalTable,
  medicalTableRow,
  prescriptionGroup,
  prescriptionLine,
} from './clinical-types'
import {medicalBook} from './medical-book'
import {medicalChapter} from './medical-chapter'
import {medicalSection} from './medical-section'
import {medicalTopic} from './medical-topic'
import {sourceCitation, sourceExtract, sourceFile, sourceLocator} from './source-types'

export const schemaTypes = [
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
  medicalSection,
  medicalBook,
  medicalChapter,
  medicalTopic,
]

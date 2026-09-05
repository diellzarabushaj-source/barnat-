import {visionTool} from '@sanity/vision'
import {defineConfig} from 'sanity'
import {structureTool} from 'sanity/structure'

import {schemaTypes} from './src/schema-types'
import {structure} from './src/structure'

export default defineConfig({
  name: 'medical-hub-authoring',
  title: 'DRx Medical Hub',
  projectId: '4wdtp8cz',
  dataset: 'production',
  plugins: [
    structureTool({structure}),
    visionTool(),
  ],
  schema: {
    types: schemaTypes,
  },
})

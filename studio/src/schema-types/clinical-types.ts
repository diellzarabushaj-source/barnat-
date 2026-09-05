import {defineArrayMember, defineField, defineType} from 'sanity'

const portableText = defineArrayMember({
  type: 'block',
  styles: [
    {title: 'Normal', value: 'normal'},
    {title: 'Titull H3', value: 'h3'},
    {title: 'Titull H4', value: 'h4'},
    {title: 'Citim', value: 'blockquote'},
  ],
  lists: [
    {title: 'Me pika', value: 'bullet'},
    {title: 'Me numra', value: 'number'},
  ],
  marks: {
    annotations: [
      {
        name: 'link',
        title: 'Lidhje',
        type: 'object',
        fields: [
          defineField({name: 'href', title: 'URL', type: 'url'}),
          defineField({name: 'openInNewTab', title: 'Hap në dritare të re', type: 'boolean', initialValue: true}),
        ],
      },
    ],
  },
})

export const clinicalCallout = defineType({
  name: 'clinicalCallout',
  title: 'Shënim klinik',
  type: 'object',
  fields: [
    defineField({
      name: 'intent',
      title: 'Lloji',
      type: 'string',
      options: {
        layout: 'radio',
        list: [
          {title: 'Pikë kyçe', value: 'keyPoint'},
          {title: 'Kujdes', value: 'warning'},
          {title: 'Shenjë alarmuese', value: 'redFlag'},
          {title: 'Referim', value: 'referral'},
          {title: 'Shënim', value: 'note'},
        ],
      },
      initialValue: 'keyPoint',
      validation: (rule) => rule.required(),
    }),
    defineField({name: 'title', title: 'Titulli', type: 'string'}),
    defineField({name: 'body', title: 'Përmbajtja', type: 'array', of: [portableText], validation: (rule) => rule.required()}),
  ],
  preview: {select: {title: 'title', subtitle: 'intent'}},
})

export const clinicalStep = defineType({
  name: 'clinicalStep',
  title: 'Hap klinik',
  type: 'object',
  fields: [
    defineField({name: 'title', title: 'Titulli', type: 'string', validation: (rule) => rule.required()}),
    defineField({name: 'action', title: 'Veprimi', type: 'text', rows: 4, validation: (rule) => rule.required()}),
    defineField({name: 'rationale', title: 'Arsyetimi', type: 'text', rows: 3}),
    defineField({name: 'setting', title: 'Konteksti / reparti', type: 'string'}),
    defineField({
      name: 'priority',
      title: 'Prioriteti',
      type: 'string',
      options: {list: [
        {title: 'Menjëherë', value: 'immediate'},
        {title: 'Prioritar', value: 'priority'},
        {title: 'Rutinë', value: 'routine'},
      ]},
    }),
    defineField({name: 'note', title: 'Shënim', type: 'text', rows: 2}),
  ],
  preview: {select: {title: 'title', subtitle: 'action'}},
})

export const clinicalStepGroup = defineType({
  name: 'clinicalStepGroup',
  title: 'Hapat klinikë',
  type: 'object',
  fields: [
    defineField({name: 'title', title: 'Titulli', type: 'string'}),
    defineField({name: 'intro', title: 'Hyrje', type: 'text', rows: 3}),
    defineField({
      name: 'steps',
      title: 'Hapat',
      type: 'array',
      of: [defineArrayMember({type: 'clinicalStep'})],
      validation: (rule) => rule.required().min(1),
    }),
  ],
  preview: {select: {title: 'title'}},
})

export const prescriptionLine = defineType({
  name: 'prescriptionLine',
  title: 'Rresht i recetës',
  type: 'object',
  fields: [
    defineField({name: 'medicine', title: 'Bari / produkti', type: 'string'}),
    defineField({name: 'genericName', title: 'Substanca aktive', type: 'string'}),
    defineField({name: 'form', title: 'Forma farmaceutike', type: 'string'}),
    defineField({name: 'strength', title: 'Fuqia', type: 'string'}),
    defineField({name: 'dose', title: 'Doza', type: 'string'}),
    defineField({name: 'route', title: 'Rruga', type: 'string'}),
    defineField({name: 'frequency', title: 'Frekuenca', type: 'string'}),
    defineField({name: 'duration', title: 'Kohëzgjatja', type: 'string'}),
    defineField({name: 'quantity', title: 'Sasia', type: 'string'}),
    defineField({name: 'instructions', title: 'Udhëzimet', type: 'text', rows: 3}),
    defineField({name: 'patientGroup', title: 'Grupi i pacientëve', type: 'string'}),
    defineField({name: 'clinicalNote', title: 'Shënim klinik', type: 'text', rows: 3}),
  ],
  preview: {
    select: {medicine: 'medicine', genericName: 'genericName', dose: 'dose'},
    prepare: ({medicine, genericName, dose}) => ({
      title: medicine || genericName || 'Rresht i recetës',
      subtitle: dose || undefined,
    }),
  },
})

export const prescriptionGroup = defineType({
  name: 'prescriptionGroup',
  title: 'Recetë / terapi',
  type: 'object',
  fields: [
    defineField({name: 'title', title: 'Titulli', type: 'string'}),
    defineField({name: 'applicability', title: 'Kur përdoret', type: 'text', rows: 3}),
    defineField({
      name: 'relation',
      title: 'Marrëdhënia mes rreshtave',
      type: 'string',
      options: {layout: 'radio', list: [
        {title: 'Të gjitha së bashku', value: 'all'},
        {title: 'Alternativa', value: 'alternative'},
        {title: 'Sipas nevojës', value: 'asNeeded'},
      ]},
      initialValue: 'all',
    }),
    defineField({
      name: 'lines',
      title: 'Rreshtat',
      type: 'array',
      of: [defineArrayMember({type: 'prescriptionLine'})],
      validation: (rule) => rule.required().min(1),
    }),
    defineField({name: 'note', title: 'Shënim', type: 'text', rows: 3}),
  ],
  preview: {select: {title: 'title', subtitle: 'applicability'}},
})

export const medicalFigure = defineType({
  name: 'medicalFigure',
  title: 'Figurë',
  type: 'object',
  fields: [
    defineField({name: 'title', title: 'Titulli', type: 'string'}),
    defineField({
      name: 'image',
      title: 'Imazhi',
      type: 'image',
      options: {hotspot: true},
      fields: [
        defineField({name: 'alt', title: 'Teksti alternativ', type: 'string', validation: (rule) => rule.required().warning()}),
      ],
    }),
    defineField({name: 'externalUrl', title: 'URL e imazhit të jashtëm', type: 'url'}),
    defineField({name: 'caption', title: 'Përshkrimi', type: 'text', rows: 3}),
    defineField({name: 'credit', title: 'Krediti', type: 'string'}),
    defineField({name: 'sourceUrl', title: 'URL e burimit', type: 'url'}),
    defineField({name: 'sourceLocator', title: 'Vendndodhja në libër', type: 'sourceLocator'}),
  ],
  preview: {select: {title: 'title', subtitle: 'caption', media: 'image'}},
})

export const medicalTableRow = defineType({
  name: 'medicalTableRow',
  title: 'Rresht tabele',
  type: 'object',
  fields: [
    defineField({name: 'label', title: 'Etiketa e rreshtit', type: 'string'}),
    defineField({name: 'cells', title: 'Qelizat', type: 'array', of: [{type: 'string'}], validation: (rule) => rule.required().min(1)}),
  ],
  preview: {select: {title: 'label'}},
})

export const medicalTable = defineType({
  name: 'medicalTable',
  title: 'Tabelë klinike',
  type: 'object',
  fields: [
    defineField({name: 'title', title: 'Titulli', type: 'string'}),
    defineField({name: 'columns', title: 'Kolonat', type: 'array', of: [{type: 'string'}], validation: (rule) => rule.required().min(1)}),
    defineField({name: 'rows', title: 'Rreshtat', type: 'array', of: [defineArrayMember({type: 'medicalTableRow'})], validation: (rule) => rule.required().min(1)}),
    defineField({name: 'note', title: 'Shënim', type: 'text', rows: 3}),
    defineField({name: 'sourceLocator', title: 'Vendndodhja në burim', type: 'sourceLocator'}),
  ],
  preview: {select: {title: 'title'}},
})

export {portableText}

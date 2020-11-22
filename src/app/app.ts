import { CollectionRegistry, DataModel, ObjectNode, PathError, SchemaRegistry } from '@mcschema/core';
import * as java16 from '@mcschema/java-1.16'
import * as java17 from '@mcschema/java-1.17'
import { LocalStorageProperty } from './state/LocalStorageProperty';
import { Property } from './state/Property';
import { Preview } from './preview/Preview';
import { RegistryFetcher } from './RegistryFetcher';
import { BiomeNoisePreview } from './preview/BiomeNoisePreview';
import { NoiseSettingsPreview } from './preview/NoiseSettingsPreview';
import config from '../config.json';
import { locale, Locales } from './Locales';
import { Tracker } from './Tracker';

const Versions: {
  [versionId: string]: {
    getCollections: () => CollectionRegistry,
    getSchemas: (collections: CollectionRegistry) => SchemaRegistry,
  }
} = {
  '1.16': java16,
  '1.17': java17
}

export const Previews: {
  [key: string]: Preview
} = {
  'biome_noise': new BiomeNoisePreview(),
  'noise_settings': new NoiseSettingsPreview()
}

export const Models: {
  [key: string]: DataModel
} = {}

config.models.filter(m => m.schema)
  .forEach(m => Models[m.id] = new DataModel(ObjectNode({})))

export const App = {
  version: new LocalStorageProperty('schema_version', config.versions[config.versions.length - 1].id)
    .watch(Tracker.dimVersion),
  theme: new LocalStorageProperty('theme', 'light')
    .watch(Tracker.dimTheme),
  language: new LocalStorageProperty('language', 'en')
    .watch(Tracker.dimLanguage),
  model: new Property<typeof config.models[0] | null>(null),
  errorsVisible: new Property(false),
  jsonError: new Property<string | null>(null),
  preview: new Property<Preview | null>(null)
    .watch(p => Tracker.dimPreview(p?.getName() ?? 'none')),
  schemasLoaded: new Property(false),
  localesLoaded: new Property(false),
  loaded: new Property(false),
  mobilePanel: new Property('tree'),
}

App.version.watchRun(async (value) => {
  App.schemasLoaded.set(false)
  await updateSchemas(value)
  App.schemasLoaded.set(true)
})

App.theme.watchRun((value) => document.documentElement.setAttribute('data-theme', value))

App.language.watchRun(async (value) => {
  App.localesLoaded.set(false)
  await updateLocale(value)
  App.localesLoaded.set(true)
})

App.localesLoaded.watch((value) => {
  if (value) {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      el.textContent = locale(el.attributes.getNamedItem('data-i18n')!.value)
    })
  }
  App.loaded.set(value && App.schemasLoaded.get())
})

App.schemasLoaded.watch((value) => {
  App.loaded.set(value && App.localesLoaded.get())
})

App.mobilePanel.watchRun((value) => {
  document.body.setAttribute('data-panel', value)
})

async function updateSchemas(version: string) {
  // await new Promise(r => setTimeout(r, 500));
  const collections = Versions[version].getCollections()
  await RegistryFetcher(collections, version)
  const schemas = Versions[version].getSchemas(collections)
  config.models
    .filter(m => m.schema)
    .filter(m => checkVersion(App.version.get(), m.minVersion ?? config.versions[0].id))
    .forEach(m => {
      const model = Models[m.id]
      const schema = schemas.get(m.schema!)
      if (schema) {
        model.schema = schema
        if (JSON.stringify(model.data) === '{}') {
          model.data = schema.default()
          model.history = [JSON.stringify(model.data)]
          model.historyIndex = 0
          model.silentInvalidate()
        }
      }
    })
}

async function updateLocale(language: string) {
  // await new Promise(r => setTimeout(r, 500));
  const data = await (await fetch(`/locales/${language}.json`)).json()
  Locales[language] = data
}

export function checkVersion(versionId: string, minVersionId: string) {
  const version = config.versions.findIndex(v => v.id === versionId)
  const minVersion = config.versions.findIndex(v => v.id === minVersionId)
  return minVersion <= version
}

document.addEventListener('keyup', (evt) => {
  if (evt.ctrlKey && evt.key === 'z') {
    Tracker.undo(true)
    Models[App.model.get()!.id].undo()
  } else if (evt.ctrlKey && evt.key === 'y') {
    Tracker.redo(true)
    Models[App.model.get()!.id].redo()
  }
})

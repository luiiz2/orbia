import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import enCommon from './locales/en/common.json'
import ptBRCommon from './locales/pt-BR/common.json'

export const defaultNS = 'common'
export const resources = {
  en: {
    common: enCommon
  },
  'pt-BR': {
    common: ptBRCommon
  },
  pt: {
    common: ptBRCommon
  }
} as const

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: 'en',
    defaultNS,
    resources,
    interpolation: {
      escapeValue: false
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage']
    },
    react: {
      useSuspense: false
    }
  })

export default i18n

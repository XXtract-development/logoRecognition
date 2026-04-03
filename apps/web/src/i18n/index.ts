import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Import translation files
import enTranslations from './locales/en.json';
import esTranslations from './locales/es.json';
import frTranslations from './locales/fr.json';
import deTranslations from './locales/de.json';
import jaTranslations from './locales/ja.json';
import zhTranslations from './locales/zh.json';
import nlTranslations from './locales/nl.json';

const resources = {
  en: {
    translation: enTranslations,
    recognition: enTranslations,  // Also expose as 'recognition' namespace
  },
  es: {
    translation: esTranslations,
    recognition: esTranslations,
  },
  fr: {
    translation: frTranslations,
    recognition: frTranslations,
  },
  de: {
    translation: deTranslations,
    recognition: deTranslations,
  },
  ja: {
    translation: jaTranslations,
    recognition: jaTranslations,
  },
  zh: {
    translation: zhTranslations,
    recognition: zhTranslations,
  },
  nl: {
    translation: nlTranslations,
    recognition: nlTranslations,
  },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    debug: false,
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;

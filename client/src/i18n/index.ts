import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { frBase } from './fr.base';
import { frGen } from './fr.gen';
import { arBase } from './ar.base';
import { arGen } from './ar.gen';

const saved = localStorage.getItem('tf_lang');
export const LANGS = { fr: { label: 'Français', dir: 'ltr' }, ar: { label: 'العربية', dir: 'rtl' } } as const;
export type Lang = keyof typeof LANGS;

export function applyLang(l: Lang) {
  document.documentElement.lang = l;
  document.documentElement.dir = LANGS[l].dir;   // full RTL layout in Arabic (Tailwind logical utilities: ms-/me-/ps-/pe-/start-/end-)
  localStorage.setItem('tf_lang', l);
}

i18n.use(initReactI18next).init({
  resources: { fr: { translation: { ...frBase, ...frGen } }, ar: { translation: { ...arBase, ...arGen } } },
  lng: saved === 'ar' ? 'ar' : 'fr',
  fallbackLng: 'fr',            // any key not yet translated to Arabic falls back to French (never shows a raw key)
  interpolation: { escapeValue: false },
  returnNull: false,
});
applyLang((saved === 'ar' ? 'ar' : 'fr') as Lang);
export const setLang = (l: Lang) => { applyLang(l); return i18n.changeLanguage(l); };
export default i18n;

import { createContext, useContext, useState, type ReactNode } from 'react';
import { translations, type Lang, type T } from './translations';

interface LangCtx {
  lang: Lang;
  t: T;
  setLang: (l: Lang) => void;
}

const LangContext = createContext<LangCtx>({
  lang: 'es',
  t: translations.es,
  setLang: () => {},
});

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>('es');
  const setLang = (l: Lang) => setLangState(l);
  return (
    <LangContext.Provider value={{ lang, t: translations[lang], setLang }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang() {
  return useContext(LangContext);
}

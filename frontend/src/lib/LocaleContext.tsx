'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

export type Locale = 'pl' | 'en';

/**
 * Static UI copy only — never the AI's own replies (those come back in
 * whatever language the model answered in) or backend-generated strings.
 * Scoped to the app chrome: topbar, login, settings, and the chat page's
 * fixed labels/buttons/empty state. Keep keys flat and dot-namespaced by
 * screen so it's obvious where each string is used.
 */
const dict = {
  pl: {
    'header.settings': 'Ustawienia konta',
    'header.admin': 'Panel administratora',
    'header.code': 'Kod i wygenerowane pliki',
    'header.incident': 'Zgłoś incydent',
    'header.support': 'Kontakt z supportem',
    'header.shortcuts': 'Skróty klawiszowe',
    'header.logout': 'Wyloguj',
    'login.title': 'Zaloguj się',
    'login.subtitle': 'Dostęp tylko dla adresów @salesmore.pl',
    'login.button': 'Zaloguj się przez Google',
    'settings.title': 'Ustawienia konta',
    'settings.loggedInAs': 'Zalogowano jako',
    'settings.theme.title': 'Motyw',
    'settings.theme.desc': 'Wybierz, czy interfejs ma być jasny czy ciemny.',
    'settings.theme.toLight': 'Przełącz na jasny',
    'settings.theme.toDark': 'Przełącz na ciemny',
    'settings.language.title': 'Język interfejsu',
    'settings.language.desc': 'Wybierz język przycisków i menu aplikacji. Odpowiedzi asystenta nie są tłumaczone.',
    'settings.deleteAccount.title': 'Usuń konto i wszystkie dane',
    'chat.newConversation': 'Nowa rozmowa',
    'chat.searchPlaceholder': 'Szukaj w rozmowach…',
    'chat.messagePlaceholder': 'Napisz wiadomość lub /pomoc…',
    'chat.model': 'Model',
    'chat.export': 'Eksportuj',
    'chat.exportMarkdown': 'Jako Markdown',
    'chat.exportPdf': 'Jako PDF',
    'chat.share': 'Udostępnij',
    'chat.shareRevoke': 'Cofnij udostępnianie',
    'chat.shareCopy': 'Kopiuj link',
    'chat.shareCopied': 'Skopiowano',
    'chat.copy': 'Kopiuj',
    'chat.copied': 'Skopiowano',
    'chat.regenerate': 'Regeneruj',
    'chat.branch': 'Rozgałęź',
    'chat.edit': 'Edytuj',
    'chat.send': 'Wyślij',
    'chat.noProject': 'Bez projektu',
  },
  en: {
    'header.settings': 'Account settings',
    'header.admin': 'Admin panel',
    'header.code': 'Code and generated files',
    'header.incident': 'Report incident',
    'header.support': 'Contact support',
    'header.shortcuts': 'Keyboard shortcuts',
    'header.logout': 'Log out',
    'login.title': 'Sign in',
    'login.subtitle': 'Access limited to @salesmore.pl addresses',
    'login.button': 'Sign in with Google',
    'settings.title': 'Account settings',
    'settings.loggedInAs': 'Signed in as',
    'settings.theme.title': 'Theme',
    'settings.theme.desc': 'Choose whether the interface is light or dark.',
    'settings.theme.toLight': 'Switch to light',
    'settings.theme.toDark': 'Switch to dark',
    'settings.language.title': 'Interface language',
    'settings.language.desc': "Choose the language for the app's buttons and menus. The assistant's replies aren't translated.",
    'settings.deleteAccount.title': 'Delete account and all data',
    'chat.newConversation': 'New conversation',
    'chat.searchPlaceholder': 'Search conversations…',
    'chat.messagePlaceholder': 'Write a message or /help…',
    'chat.model': 'Model',
    'chat.export': 'Export',
    'chat.exportMarkdown': 'As Markdown',
    'chat.exportPdf': 'As PDF',
    'chat.share': 'Share',
    'chat.shareRevoke': 'Revoke sharing',
    'chat.shareCopy': 'Copy link',
    'chat.shareCopied': 'Copied',
    'chat.copy': 'Copy',
    'chat.copied': 'Copied',
    'chat.regenerate': 'Regenerate',
    'chat.branch': 'Branch',
    'chat.edit': 'Edit',
    'chat.send': 'Send',
    'chat.noProject': 'No project',
  },
} as const;

export type TranslationKey = keyof (typeof dict)['pl'];

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey) => string;
}

const LocaleContext = createContext<LocaleContextValue | undefined>(undefined);

function getInitialLocale(): Locale {
  if (typeof window === 'undefined') return 'pl';
  const stored = window.localStorage.getItem('locale');
  if (stored === 'pl' || stored === 'en') return stored;
  return 'pl';
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('pl');

  useEffect(() => {
    setLocaleState(getInitialLocale());
  }, []);

  function setLocale(next: Locale) {
    setLocaleState(next);
    window.localStorage.setItem('locale', next);
  }

  function t(key: TranslationKey): string {
    return dict[locale][key] ?? dict.pl[key] ?? key;
  }

  return <LocaleContext.Provider value={{ locale, setLocale, t }}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error('useLocale must be used within a LocaleProvider');
  return ctx;
}

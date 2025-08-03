import React, { useState, useEffect, useRef } from 'react';
import ReactCountryFlag from "react-country-flag";
import { getCurrentLang, setCurrentLang, subscribeToLanguageChange, unsubscribeFromLanguageChange, getAvailableLanguages } from './magic-translate';
interface Language {
  name: string;
  countryCode: string;
}

const availableLanguages: Record<string, Language> = {
  en: { name: 'English', countryCode: 'US' },
  es: { name: 'Español', countryCode: 'ES' },
  fr: { name: 'Français', countryCode: 'FR' },
  de: { name: 'Deutsch', countryCode: 'DE' },
  ja: { name: '日本語', countryCode: 'JP' }
};

const LanguageSwitcher: React.FC = () => {
  const [currentLang, setCurrentLangState] = useState(getCurrentLang());
  const [open, setOpen] = useState(false);
  const [availableLanguageCodes, setAvailableLanguageCodes] = useState<string[]>(getAvailableLanguages());
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Subscribe to language changes from magic-translate (immediate UI updates)
  useEffect(() => {
    const onLangChange = () => {
      setCurrentLangState(getCurrentLang());
      setAvailableLanguageCodes(getAvailableLanguages()); // Update available languages when translations change
    };
    subscribeToLanguageChange(onLangChange);
    return () => unsubscribeFromLanguageChange(onLangChange);
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const onClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      window.addEventListener('click', onClickOutside);
    }
    return () => window.removeEventListener('click', onClickOutside);
  }, [open]);

  const selectLanguage = (code: string) => {
    setCurrentLang(code);
    setOpen(false);
    // no need to set local state here because subscription will update it
  };

  const currentLanguage = availableLanguages[currentLang] || { name: currentLang, countryCode: 'UN' };

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        aria-haspopup="true"
        aria-expanded={open}
      >
        <ReactCountryFlag 
          countryCode={currentLanguage.countryCode} 
          svg 
          style={{
            width: '1.2em',
            height: '1.2em',
            fontSize: '1.25rem'
          }}
          title={currentLanguage.name}
        />
        <span>{currentLanguage.name}</span>
        <svg
          className={`ml-2 h-4 w-4 transform transition-transform duration-200 ${open ? 'rotate-180' : 'rotate-0'}`}
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div
          className="absolute right-0 mt-2 w-48 origin-top-right rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none z-50"
          role="menu"
          aria-orientation="vertical"
          aria-labelledby="language-menu"
        >
          {availableLanguageCodes.map((code) => {
            const lang = availableLanguages[code] || { name: code, countryCode: 'UN' };
            return (
            <button
              key={code}
              onClick={() => selectLanguage(code)}
              className={`flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-indigo-600 hover:text-white focus:bg-indigo-600 focus:text-white ${
                code === currentLang ? 'font-semibold bg-indigo-100' : ''
              }`}
              role="menuitem"
            >
              <ReactCountryFlag 
                countryCode={lang.countryCode} 
                svg 
                style={{
                  width: '1.2em',
                  height: '1.2em',
                  fontSize: '1.25rem'
                }}
                title={lang.name}
              />
              <span>{lang.name}</span>
            </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default LanguageSwitcher;
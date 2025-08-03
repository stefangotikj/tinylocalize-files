import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { ChevronDown, Globe, Search, Plus, Check, X, Edit3, Calendar, Hash } from 'lucide-react';

// Configuration - Set to false to hide Magic UI in production
const MAGIC_CONFIG = {
  enableUI: true, // Enable UI in both development and production
  // Set to false to completely disable the Magic UI
};

// Magic global state with enhanced metadata
let globalTranslations: Record<string, Record<string, any>> = {};
let translationMetadata: Record<string, Record<string, { lastModified: number; characterCount: number; status: 'complete' | 'missing' | 'needs_review' }>> = {};

if (typeof window !== 'undefined') {
  // Load from localStorage only in dev mode
  if (MAGIC_CONFIG.enableUI) {
    globalTranslations = JSON.parse(localStorage.getItem('magic-translations') || '{}');
    translationMetadata = JSON.parse(localStorage.getItem('magic-translation-metadata') || '{}');
  } else {
    // In production mode, initialize empty - will be populated by loadProductionTranslations
    globalTranslations = {};
    translationMetadata = {};
  }
}
let globalLang: string = '';
if (typeof window !== 'undefined') {
  globalLang = localStorage.getItem('magic-lang') || 'en';
}
let globalKeys: Set<string> = new Set();
let subscribers: Set<() => void> = new Set();

// Try to load from production files first
const loadProductionTranslations = async (): Promise<void> => {
  try {
    // List of languages to try loading (only the ones you have files for)
    const languagesToTry = ['en', 'fr', 'es', 'de'];
    
    // Try to load each language file
    for (const lang of languagesToTry) {
      try {
        const response = await fetch(`/locales/${lang}.json`);
        if (response.ok) {
          const prodTranslations = await response.json();
          
          if (MAGIC_CONFIG.enableUI) {
            // Development: localStorage priority, merge with production files
            globalTranslations[lang] = { ...prodTranslations, ...globalTranslations[lang] };
          } else {
            // Production: use production files only
            globalTranslations[lang] = prodTranslations;
          }
        }
      } catch (error) {
        // Skip languages that don't have files
        continue;
      }
    }

    notifySubscribers();

  } catch (error) {
    // No production files, use localStorage only
  }
};

// Load production translations on startup
if (typeof window !== 'undefined') {
  // In production mode, we need to ensure languages are available immediately
  if (!MAGIC_CONFIG.enableUI) {
    // Pre-populate with expected languages to avoid empty state
    globalTranslations = {
      'en': {},
      'fr': {},
      'es': {},
      'de': {}
    };
  }
  
  // Load actual production files (will override the empty objects above)
  loadProductionTranslations();
}

// Auto-save to localStorage with metadata
const saveToStorage = (): void => {
  if (!MAGIC_CONFIG.enableUI) return; // CHANGED: Only save in development mode
  localStorage.setItem('magic-translations', JSON.stringify(globalTranslations));
  localStorage.setItem('magic-translation-metadata', JSON.stringify(translationMetadata));
};

// Update translation metadata
const updateTranslationMetadata = (key: string, lang: string, value: string): void => {
  if (!translationMetadata[lang]) {
    translationMetadata[lang] = {};
  }
  
  const characterCount = value.length;
  const status: 'complete' | 'missing' | 'needs_review' = 
    !value || value.trim() === '' ? 'missing' :
    value.includes('TODO:') || value.includes('[') && value.includes(']') ? 'needs_review' :
    'complete';
  
  translationMetadata[lang][key] = {
    lastModified: Date.now(),
    characterCount,
    status
  };
};

// Notify all subscribers
const notifySubscribers = (): void => {
  subscribers.forEach(callback => callback());
};

// Internal translation function (not exported directly)
const internalT = (key: string, vars: Record<string, string | number> = {}): string => {
  // Auto-discover keys
  globalKeys.add(key);

  // Get nested value
  const keys = key.split('.');
  let value: any = globalTranslations[globalLang];
  
  for (const k of keys) {
    if (value && typeof value === 'object' && k in value) {
      value = value[k];
    } else {
      value = undefined;
      break;
    }
  }

  // Handle missing or invalid values
  if (value === undefined || value === null) {
    // Return a fallback that won't break React
    return `TODO: Translate "${key}"`;
  }

  // CRITICAL: Prevent React error #31 by ensuring we return a string
  if (typeof value === 'object') {
    console.warn(`TinyLocalize Warning: Translation key "${key}" returns an object, not a string. This will cause React errors. Use a more specific key like "${key}.title" or "${key}.description".`);
    return `[Object: ${key}]`;
  }

  // Handle variable interpolation
  if (typeof value === 'string' && Object.keys(vars).length > 0) {
    return value.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
      return vars[varName]?.toString() || match;
    });
  }

  return value?.toString() || `TODO: Translate "${key}"`;
};

// Export helper functions for language switcher
export const getCurrentLang = (): string => globalLang;

// Language switching (unified function)
export const setCurrentLang = (lang: string): void => {

  globalLang = lang;
  localStorage.setItem('magic-lang', lang);

  // Force reload production translations for new language
  loadProductionTranslations();

  // Only reload localStorage translations in dev mode
  if (MAGIC_CONFIG.enableUI) {
    // In development mode, merge localStorage with production files
    const localStorageTranslations = JSON.parse(localStorage.getItem('magic-translations') || '{}');
    // Merge localStorage data with existing production data
    Object.keys(localStorageTranslations).forEach(langKey => {
      globalTranslations[langKey] = { ...globalTranslations[langKey], ...localStorageTranslations[langKey] };
    });
  }
  // In production mode, don't touch globalTranslations - keep the production files loaded

  // Notify all subscribers for immediate UI updates
  notifySubscribers();
};

// Alias for backward compatibility
export const setLang = setCurrentLang;

export const getAvailableLanguages = (): string[] => {
  const languages = Object.keys(globalTranslations);
  
  // In production mode, if no languages are loaded yet, return the expected languages
  if (!MAGIC_CONFIG.enableUI && languages.length === 0) {
    // Return the languages we know should be available based on your JSON files
    return ['en', 'fr', 'es', 'de'];
  }
  
  return languages;
};

// React hook for components that need to re-render on language change
export const useMagicTranslate = () => {
  const [, forceUpdate] = useState({});

  useEffect(() => {
    const callback = () => forceUpdate({});
    subscribers.add(callback);
    return () => {
      subscribers.delete(callback);
    };
  }, []);

  return { t: enhancedT, currentLang: globalLang, setLang };
};

export const subscribeToLanguageChange = (callback: () => void): void => {
  subscribers.add(callback);
};

export const unsubscribeFromLanguageChange = (callback: () => void): void => {
  subscribers.delete(callback);
};
// Enhanced Magic UI Component with performance optimizations
const MagicTranslateUI: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState<string>('');
  const [newLang, setNewLang] = useState<string>('');
  const [currentLang, setCurrentLangState] = useState(globalLang);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportedCount, setExportedCount] = useState(0);
  const [showDeleteModal, setShowDeleteModal] = useState<boolean>(false);
  const [languageToDelete, setLanguageToDelete] = useState<string>('');
  const [virtualScrollOffset, setVirtualScrollOffset] = useState(0);
  const [isAddLanguageCollapsed, setIsAddLanguageCollapsed] = useState(false);
  
  const searchInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  // Virtual scrolling constants
  const ITEM_HEIGHT = 120; // Increased height for better spacing
  const containerHeight = 450; // Increased container height
  const VISIBLE_ITEMS = Math.ceil(containerHeight / ITEM_HEIGHT) + 2; // Buffer items

  // Debounced search implementation
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);
  
  // Subscribe to language and translation changes
  const [, forceUpdate] = useState({});
  useEffect(() => {
    const callback = () => {
      setCurrentLangState(globalLang);
      forceUpdate({}); // Force re-render when translations change
    };
    subscribers.add(callback);
    return () => {
      subscribers.delete(callback);
    };
  }, []);
  
  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      
      // Ctrl/Cmd + K to focus search
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      
      // Escape to close modal or cancel editing
      if (e.key === 'Escape') {
        if (editingKey) {
          setEditingKey(null);
        } else {
          setIsOpen(false);
        }
      }
      
      // Ctrl/Cmd + S to save when editing
      if ((e.ctrlKey || e.metaKey) && e.key === 's' && editingKey) {
        e.preventDefault();
        saveEdit();
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, editingKey]);

  const startEdit = (key: string): void => {
    const getValue = (obj: any, path: string): any => {
      return path.split('.').reduce((current, key) => current?.[key], obj);
    };
    const value = getValue(globalTranslations[globalLang] || {}, key);
    setEditingKey(key);
    setEditValue(value || '');
  };

  const saveEdit = (): void => {
    if (!editingKey) return;

    const keys = editingKey.split('.');
    let current = globalTranslations[globalLang] = globalTranslations[globalLang] || {};
    for (let i = 0; i < keys.length - 1; i++) {
      current[keys[i]] = current[keys[i]] || {};
      current = current[keys[i]];
    }
    current[keys[keys.length - 1]] = editValue;
    
    // Update metadata
    updateTranslationMetadata(editingKey, globalLang, editValue);

    saveToStorage();
    notifySubscribers();
    setEditingKey(null);
  };

  const addLanguage = (): void => {
    if (newLang.trim()) {
      globalTranslations[newLang.toLowerCase()] = {};
      saveToStorage();
      notifySubscribers();
      setNewLang('');
    }
  };

  const removeLanguage = (langToRemove: string): void => {
    if (Object.keys(globalTranslations).length <= 1) {
      alert('Cannot remove the last language. At least one language must remain.');
      return;
    }
    
    if (confirm(`Are you sure you want to remove the "${langToRemove}" language and all its translations?`)) {
      delete globalTranslations[langToRemove];
      
      // If we're removing the current language, switch to the first available language
      if (globalLang === langToRemove) {
        const remainingLanguages = Object.keys(globalTranslations);
        if (remainingLanguages.length > 0) {
          setCurrentLang(remainingLanguages[0]);
        }
      }
      
      saveToStorage();
      notifySubscribers();
    }
  };

  // Memoized filtered keys for performance
  const filteredKeys = useMemo(() => {
    return Array.from(globalKeys).filter(key => 
      debouncedSearchTerm === '' || 
      key.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
      (globalTranslations[currentLang] && 
       JSON.stringify(globalTranslations[currentLang]).toLowerCase().includes(debouncedSearchTerm.toLowerCase()))
    );
  }, [debouncedSearchTerm, currentLang, globalKeys]);
  
  // Virtual scrolling calculations
  const startIndex = Math.floor(virtualScrollOffset / ITEM_HEIGHT);
  const endIndex = Math.min(startIndex + VISIBLE_ITEMS, filteredKeys.length);
  const visibleKeys = filteredKeys.slice(startIndex, endIndex);
  const totalHeight = filteredKeys.length * ITEM_HEIGHT;
  const offsetY = startIndex * ITEM_HEIGHT;
  
  // Handle virtual scroll
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const scrollTop = e.currentTarget.scrollTop;
    setVirtualScrollOffset(scrollTop);
  }, []);
  
  // Get translation status
  const getTranslationStatus = useCallback((key: string): { status: 'complete' | 'missing' | 'needs_review'; characterCount: number; lastModified: number } => {
    const getValue = (obj: any, path: string): any => {
      return path.split('.').reduce((current, key) => current?.[key], obj);
    };
    const value = getValue(globalTranslations[currentLang] || {}, key);
    const metadata = translationMetadata[currentLang]?.[key];
    
    if (metadata) {
      return metadata;
    }
    
    // Calculate status if no metadata
    const status: 'complete' | 'missing' | 'needs_review' = 
      !value || value.toString().trim() === '' ? 'missing' :
      value.toString().includes('TODO:') || (value.toString().includes('[') && value.toString().includes(']')) ? 'needs_review' :
      'complete';
    
    return {
      status,
      characterCount: value ? value.toString().length : 0,
      lastModified: Date.now()
    };
  }, [currentLang]);
  
  // Export translations to files
  const exportTranslations = (): void => {
    // Force refresh from localStorage to get latest translations
    const freshTranslations = JSON.parse(localStorage.getItem('magic-translations') || '{}');
    // Get the list of languages
    const languages = Object.keys(freshTranslations);
    // Check if there are any languages to export
    if (languages.length === 0) {
      alert('No translations to export! Add some languages and translations first.');
      return;
    }
    // Export each language to a separate file
    languages.forEach(lang => {
      const data = JSON.stringify(freshTranslations[lang], null, 2);
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${lang}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });
    // Show the export success modal
    setExportedCount(languages.length);
    setShowExportModal(true);
  };

  return (
    <>
      {/* Magic floating button - Clean & Modern with Pulsing Effect */}
      <div
        onClick={() => setIsOpen(true)}
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          width: '56px',
          height: '56px',
          borderRadius: '16px',
          backgroundColor: 'transparent',
          color: '#4f46e5',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          fontSize: '20px',
          boxShadow: '0 4px 12px rgba(79, 70, 229, 0.2)',
          zIndex: 9999,
          transition: 'all 0.2s ease',
          border: 'none',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          animation: 'magicPulse 2s ease-in-out infinite'
        }}
        onMouseEnter={(e) => {
          // Add pulsing animation styles if not already added
          if (!document.getElementById('magic-pulse-styles')) {
            const style = document.createElement('style');
            style.id = 'magic-pulse-styles';
            style.textContent = `
              @keyframes magicPulse {
                0%, 100% {
                  transform: scale(1);
                  box-shadow: 0 4px 12px rgba(79, 70, 229, 0.2), 0 0 0 0 rgba(79, 70, 229, 0.4);
                }
                50% {
                  transform: scale(1.05);
                  box-shadow: 0 8px 24px rgba(79, 70, 229, 0.3), 0 0 0 8px rgba(79, 70, 229, 0.2);
                }
              }
              
              @keyframes magicGlow {
                0%, 100% {
                  background: transparent;
                }
                50% {
                  background: rgba(79, 70, 229, 0.1);
                }
              }
            `;
            document.head.appendChild(style);
          }
          
          e.currentTarget.style.transform = 'translateY(-2px) scale(1.1)';
          e.currentTarget.style.boxShadow = '0 12px 32px rgba(79, 70, 229, 0.3)';
          e.currentTarget.style.background = 'rgba(79, 70, 229, 0.1)';
          e.currentTarget.style.animation = 'none'; // Pause pulsing on hover
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0px) scale(1)';
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(79, 70, 229, 0.2)';
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.animation = 'magicPulse 2s ease-in-out infinite'; // Resume pulsing
        }}
        onMouseDown={(e) => {
          e.currentTarget.style.transform = 'translateY(0px) scale(0.95)';
        }}
        onMouseUp={(e) => {
          e.currentTarget.style.transform = 'translateY(-2px) scale(1.1)';
        }}
      >
        <span style={{
          display: 'inline-block',
          animation: 'spin 8s linear infinite',
          fontSize: '24px',
          fontWeight: 'bold',
          color: '#4f46e5',
          textShadow: '0 0 8px rgba(79, 70, 229, 0.3)'
        }}>
          T
        </span>
      </div>

      {/* Add spinning animation for the icon */}
      <style dangerouslySetInnerHTML={{
        __html: `
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `
      }} />

      {/* Magic translation panel */}
      {isOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.8)',
          zIndex: 10000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '16px',
            padding: '24px',
            maxWidth: '1200px',
            width: '100%',
            maxHeight: '90vh',
            overflow: 'hidden',
            boxShadow: '0 25px 50px rgba(0,0,0,0.25)'
          }}>
            {/* Header with progress */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h2 style={{ margin: 0, color: '#333', fontSize: '24px', fontWeight: '600' }}>Magic Translate</h2>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button
                    onClick={exportTranslations}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: '#28a745',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontWeight: '600',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    Export
                  </button>
                  <button
                    onClick={() => setIsOpen(false)}
                    style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#999', padding: '4px' }}
                  >
                    ×
                  </button>
                </div>
              </div>
              
              {/* Progress Bar */}
              {(() => {
                const totalKeys = Array.from(globalKeys).length;
                const translatedKeys = Array.from(globalKeys).filter(key => {
                  const getValue = (obj: any, path: string): any => {
                    return path.split('.').reduce((current, key) => current?.[key], obj);
                  };
                  const value = getValue(globalTranslations[currentLang] || {}, key);
                  return value && value.toString().trim() !== '';
                }).length;
                const progress = totalKeys > 0 ? (translatedKeys / totalKeys) * 100 : 0;
                
                return (
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <span style={{ fontSize: '13px', color: '#666', fontWeight: '500' }}>
                        Translation Progress ({currentLang.toUpperCase()})
                      </span>
                      <span style={{ fontSize: '13px', color: '#4f46e5', fontWeight: '600' }}>
                        {translatedKeys}/{totalKeys} ({Math.round(progress)}%)
                      </span>
                    </div>
                    <div style={{
                      width: '100%',
                      height: '6px',
                      backgroundColor: '#f1f5f9',
                      borderRadius: '3px',
                      overflow: 'hidden'
                    }}>
                      <div style={{
                        width: `${progress}%`,
                        height: '100%',
                        backgroundColor: progress === 100 ? '#10b981' : '#4f46e5',
                        borderRadius: '3px',
                        transition: 'width 0.3s ease, background-color 0.3s ease'
                      }} />
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Collapsible Add Language Section with Smooth Animations */}
            <div style={{ 
              marginBottom: '20px', 
              border: '1px solid #e2e8f0',
              borderRadius: '16px',
              backgroundColor: '#ffffff',
              boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
              overflow: 'hidden',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
            }}>
              {/* Collapsible Header */}
              <button
                onClick={() => setIsAddLanguageCollapsed(!isAddLanguageCollapsed)}
                style={{
                  width: '100%',
                  padding: '16px 20px',
                  backgroundColor: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  transition: 'all 0.2s ease',
                  borderRadius: isAddLanguageCollapsed ? '16px' : '16px 16px 0 0'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#f8fafc';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <Globe size={20} style={{ color: '#4f46e5' }} />
                  <h3 style={{ 
                    margin: 0, 
                    fontSize: '16px', 
                    fontWeight: '600', 
                    color: '#334155'
                  }}>
                    Add New Language
                  </h3>
                </div>
                <div style={{ 
                  transform: `rotate(${isAddLanguageCollapsed ? '0deg' : '180deg'})`,
                  transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  color: '#64748b'
                }}>
                  <ChevronDown size={20} />
                </div>
              </button>
              
              {/* Collapsible Content with Smooth Animation */}
              <div style={{
                maxHeight: isAddLanguageCollapsed ? '0px' : '200px',
                opacity: isAddLanguageCollapsed ? 0 : 1,
                overflow: 'hidden',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                transform: `translateY(${isAddLanguageCollapsed ? '-10px' : '0px'})`
              }}>
                <div style={{ 
                  padding: '0 20px 20px 20px',
                  borderTop: '1px solid #f1f5f9'
                }}>
                  <p style={{ 
                    margin: '16px 0 16px 0', 
                    fontSize: '13px', 
                    color: '#64748b',
                    fontWeight: '400',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}>
                    <kbd style={{
                      padding: '2px 6px',
                      backgroundColor: '#f1f5f9',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: '600',
                      color: '#4f46e5'
                    }}>Ctrl+K</kbd>
                    to focus search
                  </p>
                  
                  {/* Language Tabs inside collapsible section */}
                  <div style={{ marginBottom: '16px' }}>
                    <h4 style={{ 
                      margin: '0 0 12px 0', 
                      fontSize: '14px', 
                      fontWeight: '600', 
                      color: '#334155'
                    }}>
                      Available Languages
                    </h4>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {Object.keys(globalTranslations).map(lang => (
                        <div
                          key={lang}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            border: currentLang === lang ? '2px solid #4f46e5' : '2px solid #e2e8f0',
                            backgroundColor: currentLang === lang ? '#4f46e5' : 'white',
                            borderRadius: '20px',
                            overflow: 'hidden',
                            transition: 'all 0.2s ease'
                          }}
                        >
                          <button
                            onClick={() => setCurrentLang(lang)}
                            style={{
                              padding: '6px 12px',
                              border: 'none',
                              backgroundColor: 'transparent',
                              color: currentLang === lang ? 'white' : '#333',
                              cursor: 'pointer',
                              fontSize: '13px',
                              fontWeight: '600',
                              textTransform: 'uppercase',
                              transition: 'all 0.2s ease'
                            }}
                          >
                            {lang}
                          </button>
                          {Object.keys(globalTranslations).length > 1 && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setLanguageToDelete(lang);
                                setShowDeleteModal(true);
                              }}
                              style={{
                                padding: '6px 8px',
                                border: 'none',
                                backgroundColor: 'transparent',
                                color: currentLang === lang ? 'white' : '#999',
                                cursor: 'pointer',
                                fontSize: '14px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                borderLeft: currentLang === lang ? '1px solid rgba(255,255,255,0.3)' : '1px solid #e2e8f0',
                                transition: 'all 0.2s ease'
                              }}
                              title={`Remove ${lang} language`}
                            >
                              <X size={12} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <input
                      type="text"
                      value={newLang}
                      onChange={(e) => setNewLang(e.target.value)}
                      placeholder="Add language (e.g., fr, de, ja)"
                      onKeyPress={(e) => e.key === 'Enter' && addLanguage()}
                      style={{
                        flex: 1,
                        padding: '12px 16px',
                        border: '2px solid #e2e8f0',
                        borderRadius: '12px',
                        fontSize: '14px',
                        color: '#333',
                        backgroundColor: '#fff',
                        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                        outline: 'none'
                      }}
                      onFocus={(e) => {
                        e.target.style.borderColor = '#4f46e5';
                        e.target.style.boxShadow = '0 0 0 3px rgba(79, 70, 229, 0.1)';
                        e.target.style.transform = 'scale(1.02)';
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = '#e2e8f0';
                        e.target.style.boxShadow = 'none';
                        e.target.style.transform = 'scale(1)';
                      }}
                    />
                    <button
                      onClick={addLanguage}
                      disabled={!newLang.trim()}
                      style={{
                        padding: '12px 20px',
                        backgroundColor: newLang.trim() ? '#4f46e5' : '#94a3b8',
                        color: 'white',
                        border: 'none',
                        borderRadius: '12px',
                        cursor: newLang.trim() ? 'pointer' : 'not-allowed',
                        fontSize: '14px',
                        fontWeight: '600',
                        whiteSpace: 'nowrap',
                        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        transform: newLang.trim() ? 'scale(1)' : 'scale(0.95)'
                      }}
                      onMouseEnter={(e) => {
                        if (newLang.trim()) {
                          e.currentTarget.style.backgroundColor = '#3730a3';
                          e.currentTarget.style.transform = 'scale(1.05)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (newLang.trim()) {
                          e.currentTarget.style.backgroundColor = '#4f46e5';
                          e.currentTarget.style.transform = 'scale(1)';
                        }
                      }}
                    >
                      <Plus size={16} />
                      Add
                    </button>
                  </div>
                </div>
              </div>
            </div>



            {/* Enhanced Search Bar with Smooth Animations */}
            <div style={{ 
              marginBottom: '20px', 
              padding: '16px', 
              backgroundColor: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)', 
              borderRadius: '12px',
              border: '1px solid #e2e8f0',
              boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Search size={18} style={{ 
                  color: '#4f46e5',
                  transition: 'all 0.2s ease',
                  transform: searchTerm ? 'scale(1.1)' : 'scale(1)'
                }} />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search translation keys and values... (Ctrl+K)"
                  style={{
                    flex: 1,
                    padding: '12px 16px',
                    border: '2px solid #e2e8f0',
                    borderRadius: '10px',
                    fontSize: '14px',
                    color: '#333',
                    backgroundColor: '#fff',
                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                    outline: 'none'
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = '#4f46e5';
                    e.target.style.boxShadow = '0 0 0 3px rgba(79, 70, 229, 0.1)';
                    e.target.style.transform = 'scale(1.02)';
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = '#e2e8f0';
                    e.target.style.boxShadow = 'none';
                    e.target.style.transform = 'scale(1)';
                  }}
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: '#64748b',
                      padding: '8px',
                      borderRadius: '8px',
                      transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transform: 'scale(1)'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#fef2f2';
                      e.currentTarget.style.color = '#ef4444';
                      e.currentTarget.style.transform = 'scale(1.1)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                      e.currentTarget.style.color = '#64748b';
                      e.currentTarget.style.transform = 'scale(1)';
                    }}
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            </div>

            {/* Enhanced Translation Keys with Status and Virtual Scrolling */}
            <div style={{ 
              marginBottom: '12px', 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              padding: '0 4px'
            }}>
              <div style={{ fontSize: '14px', color: '#64748b', fontWeight: '600' }}>
                {(() => {
                  const total = Array.from(globalKeys).length;
                  const completed = filteredKeys.filter(key => {
                    const status = getTranslationStatus(key);
                    return status.status === 'complete';
                  }).length;
                  return debouncedSearchTerm ? 
                    `Found ${filteredKeys.length} of ${total} keys` : 
                    `${total} translation keys • ${completed} completed`;
                })()}
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981' }}></div>
                  <span style={{ color: '#64748b' }}>Complete</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#f59e0b' }}></div>
                  <span style={{ color: '#64748b' }}>Review</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#ef4444' }}></div>
                  <span style={{ color: '#64748b' }}>Missing</span>
                </div>
              </div>
            </div>
            
            {/* Virtual Scrolling Container */}
            <div 
              ref={scrollContainerRef}
              style={{
                height: `${containerHeight}px`,
                overflowY: 'auto',
                overflowX: 'hidden',
                scrollbarWidth: 'thin',
                scrollbarColor: '#4f46e5 #f1f5f9',
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                backgroundColor: '#fafbfc'
              }}
              onScroll={handleScroll}
              onMouseEnter={(e) => {
                // Add custom scrollbar styles for webkit browsers
                if (!document.getElementById('magic-scrollbar-styles')) {
                  const style = document.createElement('style');
                  style.id = 'magic-scrollbar-styles';
                  style.textContent = `
                    .magic-translate-scroll::-webkit-scrollbar {
                      width: 10px;
                    }
                    .magic-translate-scroll::-webkit-scrollbar-track {
                      background: #f1f5f9;
                      border-radius: 10px;
                    }
                    .magic-translate-scroll::-webkit-scrollbar-thumb {
                      background: linear-gradient(180deg, #4f46e5 0%, #3730a3 100%);
                      border-radius: 10px;
                      border: 1px solid #e5e7eb;
                    }
                    .magic-translate-scroll::-webkit-scrollbar-thumb:hover {
                      background: linear-gradient(180deg, #3730a3 0%, #312e81 100%);
                    }
                  `;
                  document.head.appendChild(style);
                }
                e.currentTarget.classList.add('magic-translate-scroll');
              }}
            >
              {/* Virtual Scrolling Spacer */}
              <div style={{ height: `${totalHeight}px`, position: 'relative' }}>
                <div style={{ transform: `translateY(${offsetY}px)` }}>
                  {visibleKeys.map(key => {
                    const getValue = (obj: any, path: string): any => {
                      return path.split('.').reduce((current, key) => current?.[key], obj);
                    };
                    const value = getValue(globalTranslations[currentLang] || {}, key);
                    const isEditing = editingKey === key;
                    const status = getTranslationStatus(key);
                    
                    const statusColors = {
                      complete: '#10b981',
                      needs_review: '#f59e0b', 
                      missing: '#ef4444'
                    };
                    
                    const statusBgColors = {
                      complete: '#f0fdf4',
                      needs_review: '#fffbeb',
                      missing: '#fef2f2'
                    };

                    return (
                      <div key={key} style={{
                        minHeight: `${ITEM_HEIGHT}px`,
                        height: 'auto',
                        padding: '16px',
                        margin: '8px 12px',
                        border: `2px solid ${isEditing ? '#4f46e5' : '#e2e8f0'}`,
                        borderRadius: '12px',
                        backgroundColor: isEditing ? '#f8fafc' : statusBgColors[status.status],
                        boxShadow: isEditing ? '0 8px 25px rgba(79, 70, 229, 0.15)' : '0 2px 4px rgba(0,0,0,0.05)',
                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px',
                        transform: isEditing ? 'scale(1.02)' : 'scale(1)',
                        position: 'relative',
                        overflow: 'visible'
                      }}
                      onMouseEnter={(e) => {
                        if (!isEditing) {
                          e.currentTarget.style.transform = 'scale(1.01) translateY(-2px)';
                          e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isEditing) {
                          e.currentTarget.style.transform = 'scale(1) translateY(0px)';
                          e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.05)';
                        }
                      }}
                      >
                        {/* Header with Key Name and Status */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ 
                              width: '10px', 
                              height: '10px', 
                              borderRadius: '50%', 
                              backgroundColor: statusColors[status.status],
                              flexShrink: 0
                            }}></div>
                            <span style={{ 
                              fontWeight: '700', 
                              color: '#1e293b', 
                              fontSize: '14px',
                              fontFamily: 'monospace'
                            }}>
                              {key}
                            </span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px', color: '#64748b' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <Hash size={12} style={{ color: '#94a3b8' }} />
                              <span>{status.characterCount} chars</span>
                            </div>
                            {status.lastModified && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <Calendar size={12} style={{ color: '#94a3b8' }} />
                                <span>{new Date(status.lastModified).toLocaleDateString()}</span>
                              </div>
                            )}
                            <span style={{ 
                              padding: '4px 8px', 
                              borderRadius: '6px', 
                              backgroundColor: statusColors[status.status],
                              color: 'white',
                              fontSize: '10px',
                              fontWeight: '600',
                              textTransform: 'uppercase',
                              boxShadow: `0 2px 4px ${statusColors[status.status]}40`,
                              transition: 'all 0.2s ease'
                            }}>
                              {status.status.replace('_', ' ')}
                            </span>
                          </div>
                        </div>
                        
                        {/* Translation Value */}
                        {isEditing ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <input
                              type="text"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyPress={(e) => e.key === 'Enter' && saveEdit()}
                              style={{
                                width: '100%',
                                padding: '12px 16px',
                                border: '2px solid #4f46e5',
                                borderRadius: '8px',
                                fontSize: '14px',
                                color: '#333',
                                backgroundColor: '#fff',
                                outline: 'none',
                                boxSizing: 'border-box'
                              }}
                              autoFocus
                            />
                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button 
                              onClick={saveEdit} 
                              style={{
                                padding: '10px 16px',
                                backgroundColor: '#10b981',
                                color: 'white',
                                border: 'none',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                fontWeight: '600',
                                fontSize: '13px',
                                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                transform: 'scale(1)'
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = '#059669';
                                e.currentTarget.style.transform = 'scale(1.05)';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = '#10b981';
                                e.currentTarget.style.transform = 'scale(1)';
                              }}
                            >
                              <Check size={14} />
                              Save
                            </button>
                            <button 
                              onClick={() => setEditingKey(null)} 
                              style={{
                                padding: '10px 16px',
                                backgroundColor: '#64748b',
                                color: 'white',
                                border: 'none',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                fontSize: '13px',
                                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                transform: 'scale(1)'
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = '#475569';
                                e.currentTarget.style.transform = 'scale(1.05)';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = '#64748b';
                                e.currentTarget.style.transform = 'scale(1)';
                              }}
                            >
                              <X size={14} />
                              Cancel
                            </button>
                            </div>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <span style={{ 
                              fontSize: '14px', 
                              color: '#334155',
                              fontWeight: '500',
                              lineHeight: '1.4',
                              wordBreak: 'break-word'
                            }}>
                              {(() => {
                                // Safely handle objects to prevent React error #31
                                if (typeof value === 'object' && value !== null) {
                                  return `[Object: ${key}] - Use specific key like ${key}.title`;
                                }
                                return value || `[Missing translation for ${key}]`;
                              })()}
                            </span>
                            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                              <button 
                              onClick={() => startEdit(key)} 
                              style={{
                                padding: '8px 12px',
                                backgroundColor: '#4f46e5',
                                color: 'white',
                                border: 'none',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                fontSize: '13px',
                                fontWeight: '600',
                                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                transform: 'scale(1)',
                                boxShadow: '0 2px 4px rgba(79, 70, 229, 0.2)'
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = '#3730a3';
                                e.currentTarget.style.transform = 'scale(1.05) translateY(-1px)';
                                e.currentTarget.style.boxShadow = '0 4px 8px rgba(79, 70, 229, 0.3)';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = '#4f46e5';
                                e.currentTarget.style.transform = 'scale(1) translateY(0px)';
                                e.currentTarget.style.boxShadow = '0 2px 4px rgba(79, 70, 229, 0.2)';
                              }}
                            >
                              <Edit3 size={14} />
                              Edit
                            </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Professional Export Success Modal */}
      {showExportModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          zIndex: 10001,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '15px',
            padding: '30px',
            maxWidth: '400px',
            width: '90%',
            boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '48px', marginBottom: '20px' }}>🎉</div>
            <h3 style={{ margin: '0 0 15px 0', color: '#333', fontSize: '24px' }}>
              Export Successful!
            </h3>
            <p style={{ margin: '0 0 20px 0', color: '#666', fontSize: '16px', lineHeight: '1.5' }}>
              Exported {exportedCount} language file{exportedCount !== 1 ? 's' : ''}!
              <br />
              <strong>Place them in your public/locales/ folder for production.</strong>
            </p>
            <button
              onClick={() => setShowExportModal(false)}
              style={{
                padding: '12px 24px',
                backgroundColor: '#4f46e5',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '16px',
                fontWeight: 'bold'
              }}
            >
              Got it!
            </button>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          zIndex: 10001,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '15px',
            padding: '30px',
            maxWidth: '400px',
            width: '90%',
            boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
            textAlign: 'center'
          }}>
            <h3 style={{ margin: '0 0 15px 0', color: '#333', fontSize: '24px' }}>
              Confirm Deletion
            </h3>
            <p style={{ margin: '0 0 20px 0', color: '#666', fontSize: '16px', lineHeight: '1.5' }}>
              Are you sure you want to remove the "{languageToDelete}" language and all its translations?
            </p>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  removeLanguage(languageToDelete);
                }}
                style={{
                  padding: '12px 24px',
                  backgroundColor: '#dc3545',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '16px',
                  fontWeight: 'bold'
                }}
              >
                Delete
              </button>
              <button
                onClick={() => setShowDeleteModal(false)}
                style={{
                  padding: '12px 24px',
                  backgroundColor: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '16px'
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

// Auto-inject the Magic UI when keys are used
let uiInjected = false;
const injectMagicUI = (): void => {
  if (uiInjected || typeof window === 'undefined') return;

  setTimeout(() => {
    if (globalKeys.size > 0 && !uiInjected) {
      uiInjected = true;
      const div = document.createElement('div');
      document.body.appendChild(div);

      // Import React DOM dynamically
      import('react-dom/client').then(({ createRoot }) => {
        const root = createRoot(div);
        root.render(React.createElement(MagicTranslateUI));
      });
    }
  }, 1000);
};

// Create the enhanced translation function that includes UI injection
const enhancedT = (key: string, vars: Record<string, string | number> = {}): string => {
  const result = internalT(key, vars);
  if (MAGIC_CONFIG.enableUI) {
    injectMagicUI();
  }
  return result;
};

// Export the enhanced translation function
export { enhancedT as t };

export default MagicTranslateUI;

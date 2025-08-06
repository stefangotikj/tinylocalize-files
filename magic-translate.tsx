import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Search, Plus, Check, X, Edit3, Calendar, Hash } from 'lucide-react';

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

// Initialize translations
const initializeTranslations = async () => {
  // First load production translations
  await loadProductionTranslations();
  
  // Get list of actually loaded languages from files
  const loadedLanguages = Object.keys(globalTranslations).filter(
    lang => Object.keys(globalTranslations[lang] || {}).length > 0
  );
  
  // Clean up old languages from localStorage in both dev and prod
  const existingLanguages = Object.keys(globalTranslations);
  const languagesToRemove = existingLanguages.filter(lang => !loadedLanguages.includes(lang));
  
  if (languagesToRemove.length > 0) {
    languagesToRemove.forEach(lang => {
      delete globalTranslations[lang];
      delete translationMetadata[lang];
    });
    
    // Update localStorage if in dev mode
    if (MAGIC_CONFIG.enableUI) {
      localStorage.setItem('magic-translations', JSON.stringify(globalTranslations));
      localStorage.setItem('magic-translation-metadata', JSON.stringify(translationMetadata));
    }
  }
};

// Start initialization
if (typeof window !== 'undefined') {
  initializeTranslations().catch(console.error);
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
  const [, forceUpdate] = useState({});
  const [showAddLanguageModal, setShowAddLanguageModal] = useState(false);
  
  // Group filtering state
  const [selectedGroup, setSelectedGroup] = useState<string>('all');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  
  // Modal resizing state with persistence
  const [modalSize, setModalSize] = useState(() => {
    try {
      const saved = localStorage.getItem('magic-translate-modal-size');
      return saved ? JSON.parse(saved) : { width: 1200, height: 800 };
    } catch {
      return { width: 1200, height: 800 };
    }
  });
  const [isResizing, setIsResizing] = useState(false);
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0 });
  
  // Virtual scrolling state
  const [virtualScrollOffset, setVirtualScrollOffset] = useState(0);
  
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

  // Reset scroll position when modal opens
  useEffect(() => {
    if (isOpen) {
      setVirtualScrollOffset(0);
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = 0;
      }
    }
  }, [isOpen]);

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
  
  const cancelEdit = (): void => {
    setEditingKey(null);
    setEditValue('');
  };

  const addLanguage = (): void => {
    if (newLang.trim()) {
      globalTranslations[newLang.toLowerCase()] = {};
      saveToStorage();
      notifySubscribers();
      setNewLang('');
      forceUpdate({});
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
  
  // Group parsing and filtering logic
  const groupedKeys = useMemo(() => {
    const groups: { [key: string]: string[] } = {};
    
    filteredKeys.forEach(key => {
      const parts = key.split('.');
      const groupName = parts.length > 1 ? parts[0] : 'ungrouped';
      
      if (!groups[groupName]) {
        groups[groupName] = [];
      }
      groups[groupName].push(key);
    });
    
    return groups;
  }, [filteredKeys]);
  
  const availableGroups = useMemo(() => {
    return Object.keys(groupedKeys).sort();
  }, [groupedKeys]);
  
  const displayKeys = useMemo(() => {
    // If no groups exist or "all" is selected, show all keys
    if (availableGroups.length <= 1 || selectedGroup === 'all') {
      return filteredKeys;
    }
    // Show keys from selected group only
    return groupedKeys[selectedGroup] || [];
  }, [filteredKeys, groupedKeys, selectedGroup, availableGroups]);
  
  // Virtual scrolling calculations
  const startIndex = Math.floor(virtualScrollOffset / ITEM_HEIGHT);
  const endIndex = Math.min(startIndex + VISIBLE_ITEMS, displayKeys.length);
  const visibleKeys = displayKeys.slice(startIndex, endIndex);
  const totalHeight = displayKeys.length * ITEM_HEIGHT;
  const offsetY = startIndex * ITEM_HEIGHT;
  
  // Simple scroll handler for virtual scrolling
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const scrollTop = e.currentTarget.scrollTop;
    setVirtualScrollOffset(scrollTop);
  }, []);
  
  // Modal resize handlers
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    setResizeStart({
      x: e.clientX,
      y: e.clientY,
      width: modalSize.width,
      height: modalSize.height
    });
  }, [modalSize]);
  
  const handleResizeMove = useCallback((e: MouseEvent) => {
    if (!isResizing) return;
    
    const deltaX = e.clientX - resizeStart.x;
    const deltaY = e.clientY - resizeStart.y;
    
    const newWidth = Math.max(800, Math.min(1600, resizeStart.width + deltaX));
    const newHeight = Math.max(600, Math.min(1000, resizeStart.height + deltaY));
    
    setModalSize({ width: newWidth, height: newHeight });
  }, [isResizing, resizeStart]);
  
  const handleResizeEnd = useCallback(() => {
    setIsResizing(false);
    // Save modal size to localStorage
    try {
      localStorage.setItem('magic-translate-modal-size', JSON.stringify(modalSize));
    } catch (e) {
      console.warn('Failed to save modal size to localStorage:', e);
    }
  }, [modalSize]);
  
  // Add resize event listeners
  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleResizeMove);
      document.addEventListener('mouseup', handleResizeEnd);
      document.body.style.cursor = 'nw-resize';
      document.body.style.userSelect = 'none';
      
      return () => {
        document.removeEventListener('mousemove', handleResizeMove);
        document.removeEventListener('mouseup', handleResizeEnd);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
    }
  }, [isResizing, handleResizeMove, handleResizeEnd]);
  
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

      {/* Add spinning animation for the icon and scrollbar styles */}
      <style dangerouslySetInnerHTML={{
        __html: `
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
          
          /* Subtle scrollbar styling */
          .translation-list::-webkit-scrollbar {
            width: 6px;
          }
          
          .translation-list::-webkit-scrollbar-track {
            background: transparent;
          }
          
          .translation-list::-webkit-scrollbar-thumb {
            background: rgba(0, 0, 0, 0.2);
            border-radius: 3px;
            transition: background-color 0.2s ease;
          }
          
          .translation-list::-webkit-scrollbar-thumb:hover {
            background: rgba(0, 0, 0, 0.4);
          }
          
          .translation-list {
            scrollbar-width: thin;
            scrollbar-color: rgba(0, 0, 0, 0.2) transparent;
          }
          
          .magic-translate-scroll::-webkit-scrollbar-thumb {
            background: transparent;
          }
          
          /* Firefox - hide scrollbar */
          .magic-translate-scroll {
            scrollbar-width: none;
            -ms-overflow-style: none;
          }
          
          /* Lazy loading spinning circle animation */
          @keyframes spin-loader {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          
          .loading-spinner {
            position: relative;
          }
          
          .loading-spinner::before {
            content: '';
            position: absolute;
            top: 50%;
            right: 16px;
            width: 16px;
            height: 16px;
            border: 2px solid #e2e8f0;
            border-top: 2px solid #4f46e5;
            border-radius: 50%;
            animation: spin-loader 1s linear infinite;
            transform: translateY(-50%);
            z-index: 10;
          }
          
          .loading-spinner::after {
            content: '';
            position: absolute;
            top: 50%;
            right: 16px;
            width: 16px;
            height: 16px;
            border: 2px solid #e2e8f0;
            border-top: 2px solid #4f46e5;
            border-radius: 50%;
            animation: spin-loader 1s linear infinite;
            transform: translateY(-50%);
            z-index: 10;
          }
          
          /* Modal resize handle */
          .resize-handle {
            position: absolute;
            bottom: 0;
            right: 0;
            width: 20px;
            height: 20px;
            cursor: nw-resize;
            background: linear-gradient(-45deg, transparent 30%, #4f46e5 30%, #4f46e5 40%, transparent 40%, transparent 60%, #4f46e5 60%, #4f46e5 70%, transparent 70%);
            opacity: 0.6;
            transition: opacity 0.2s ease;
          }
          
          .resize-handle:hover {
            opacity: 1;
          }
          
          /* Smooth scrolling behavior */
          .magic-translate-scroll {
            scroll-behavior: smooth;
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
          alignItems: 'flex-start',
          justifyContent: 'center',
          padding: '20px',
          paddingTop: '40px',
          overflowY: 'auto'
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '16px',
            padding: '24px',
            width: `${modalSize.width}px`,
            height: `${modalSize.height}px`,
            maxWidth: '90vw',
            maxHeight: '90vh',
            minWidth: '800px',
            minHeight: '600px',
            overflow: 'hidden',
            boxShadow: '0 25px 50px rgba(0,0,0,0.25)',
            position: 'relative',
            margin: '0 auto',
            resize: 'none',
            transition: isResizing ? 'none' : 'all 0.2s ease'
          }}>
            {/* Header with progress */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <h2 style={{ margin: 0, color: '#333', fontSize: '24px', fontWeight: '600' }}>Magic Translate</h2>
                  
                  {/* Language Dropdown */}
                  {Object.keys(globalTranslations).length > 1 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <label style={{
                        fontSize: '14px',
                        fontWeight: '600',
                        color: '#6b7280'
                      }}>
                        Language:
                      </label>
                      <select
                        value={currentLang}
                        onChange={(e) => setCurrentLang(e.target.value)}
                        style={{
                          padding: '6px 12px',
                          border: '2px solid #e2e8f0',
                          borderRadius: '8px',
                          fontSize: '14px',
                          fontWeight: '600',
                          backgroundColor: 'white',
                          color: '#333',
                          cursor: 'pointer',
                          outline: 'none',
                          textTransform: 'uppercase',
                          minWidth: '60px'
                        }}
                        onFocus={(e) => {
                          e.target.style.borderColor = '#4f46e5';
                        }}
                        onBlur={(e) => {
                          e.target.style.borderColor = '#e2e8f0';
                        }}
                      >
                        {Object.keys(globalTranslations).map(lang => (
                          <option key={lang} value={lang}>
                            {lang.toUpperCase()}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  
                  {/* Group Filter */}
                  {availableGroups.length > 1 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <label style={{
                        fontSize: '14px',
                        fontWeight: '600',
                        color: '#6b7280'
                      }}>
                        Group:
                      </label>
                      <select
                        value={selectedGroup}
                        onChange={(e) => setSelectedGroup(e.target.value)}
                        style={{
                          padding: '6px 12px',
                          border: '2px solid #e2e8f0',
                          borderRadius: '8px',
                          fontSize: '14px',
                          fontWeight: '600',
                          backgroundColor: 'white',
                          color: '#333',
                          cursor: 'pointer',
                          outline: 'none',
                          minWidth: '120px'
                        }}
                        onFocus={(e) => {
                          e.target.style.borderColor = '#4f46e5';
                        }}
                        onBlur={(e) => {
                          e.target.style.borderColor = '#e2e8f0';
                        }}
                      >
                        <option value="all">📁 All Groups ({filteredKeys.length} total)</option>
                        {availableGroups.map(group => {
                          const count = groupedKeys[group]?.length || 0;
                          const translatedCount = groupedKeys[group]?.filter(key => {
                            const getValue = (obj: any, path: string): any => {
                              return path.split('.').reduce((current, key) => current?.[key], obj);
                            };
                            const value = getValue(globalTranslations[currentLang] || {}, key);
                            return value && value.toString().trim() !== '';
                          }).length || 0;
                          return (
                            <option key={group} value={group}>
                              📂 {group} ({translatedCount}/{count} translated)
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  )}
                </div>
                
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button
                    onClick={() => setShowAddLanguageModal(true)}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: '#4f46e5',
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
                    <Plus size={14} />
                    Add Language
                  </button>
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
            
            {/* Translation Container */}
            <div
              ref={scrollContainerRef}
              className="translation-list"
              onScroll={handleScroll}
              style={{
                height: `${modalSize.height - 300}px`,
                overflowY: 'auto',
                overflowX: 'hidden',
                position: 'relative',
                backgroundColor: '#fafafa',
                borderRadius: '12px',
                border: '1px solid #e2e8f0',
                scrollBehavior: 'smooth'
              }}
            >
              {availableGroups.length > 1 && selectedGroup === 'all' ? (
                // Grouped View
                <div style={{ padding: '12px' }}>
                  {availableGroups.map(groupName => {
                    const groupKeys = groupedKeys[groupName] || [];
                    const isExpanded = expandedGroups.has(groupName);
                    const translatedCount = groupKeys.filter(key => {
                      const getValue = (obj: any, path: string): any => {
                        return path.split('.').reduce((current, key) => current?.[key], obj);
                      };
                      const value = getValue(globalTranslations[currentLang] || {}, key);
                      return value && value.toString().trim() !== '';
                    }).length;
                    
                    return (
                      <div key={groupName} style={{ marginBottom: '16px' }}>
                        {/* Group Header */}
                        <div
                          onClick={() => {
                            const newExpanded = new Set(expandedGroups);
                            if (isExpanded) {
                              newExpanded.delete(groupName);
                            } else {
                              newExpanded.add(groupName);
                            }
                            setExpandedGroups(newExpanded);
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '12px 16px',
                            backgroundColor: 'white',
                            borderRadius: '8px',
                            border: '2px solid #e2e8f0',
                            cursor: 'pointer',
                            marginBottom: isExpanded ? '8px' : '0',
                            transition: 'all 0.2s ease'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = '#4f46e5';
                            e.currentTarget.style.backgroundColor = '#f8fafc';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = '#e2e8f0';
                            e.currentTarget.style.backgroundColor = 'white';
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <span style={{ fontSize: '16px' }}>
                              {isExpanded ? '📂' : '📁'}
                            </span>
                            <div>
                              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: '#333' }}>
                                {groupName}
                              </h3>
                              <p style={{ margin: 0, fontSize: '12px', color: '#666' }}>
                                {translatedCount}/{groupKeys.length} translated ({Math.round((translatedCount / groupKeys.length) * 100)}%)
                              </p>
                            </div>
                          </div>
                          <div style={{
                            width: '24px',
                            height: '24px',
                            borderRadius: '50%',
                            backgroundColor: translatedCount === groupKeys.length ? '#10b981' : '#f59e0b',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'white',
                            fontSize: '12px',
                            fontWeight: '600'
                          }}>
                            {Math.round((translatedCount / groupKeys.length) * 100)}
                          </div>
                        </div>
                        
                        {/* Group Items */}
                        {isExpanded && (
                          <div style={{ marginLeft: '16px' }}>
                            {groupKeys.map(key => {
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
                                <div key={key} 
                                  className=""
                                  style={{
                                    minHeight: `${ITEM_HEIGHT}px`,
                                    height: 'auto',
                                    padding: '12px',
                                    margin: '6px 0',
                                    border: `2px solid ${isEditing ? '#4f46e5' : '#e2e8f0'}`,
                                    borderRadius: '8px',
                                    backgroundColor: isEditing ? '#f8fafc' : statusBgColors[status.status],
                                    boxShadow: isEditing ? '0 4px 12px rgba(79, 70, 229, 0.15)' : '0 1px 3px rgba(0,0,0,0.05)',
                                    transition: 'all 0.2s ease',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '8px',
                                    transform: isEditing ? 'scale(1.01)' : 'scale(1)',
                                    position: 'relative',
                                    overflow: 'visible',
                                    opacity: 1
                                  }}
                                  onMouseEnter={(e) => {
                                    if (!isEditing) {
                                      e.currentTarget.style.transform = 'scale(1.005) translateY(-1px)';
                                      e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)';
                                    }
                                  }}
                                  onMouseLeave={(e) => {
                                    if (!isEditing) {
                                      e.currentTarget.style.transform = 'scale(1)';
                                      e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)';
                                    }
                                  }}
                                >
                                  {/* Rest of translation item content will be added next */}
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                                        <div style={{
                                          width: '8px',
                                          height: '8px', 
                                          borderRadius: '50%',
                                          backgroundColor: statusColors[status.status],
                                          flexShrink: 0
                                        }}></div>
                                        <span style={{
                                          fontSize: '13px',
                                          fontWeight: '600',
                                          color: '#374151',
                                          fontFamily: 'monospace',
                                          wordBreak: 'break-all'
                                        }}>
                                          {key.split('.').pop()} {/* Show only the key part after the dot */}
                                        </span>
                                        <span style={{
                                          fontSize: '11px',
                                          color: '#9ca3af',
                                          fontWeight: '500'
                                        }}>
                                          ({key})
                                        </span>
                                      </div>
                                      
                                      {isEditing ? (
                                        <textarea
                                          value={editValue}
                                          onChange={(e) => setEditValue(e.target.value)}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter' && !e.shiftKey) {
                                              e.preventDefault();
                                              saveEdit();
                                            } else if (e.key === 'Escape') {
                                              cancelEdit();
                                            }
                                          }}
                                          autoFocus
                                          style={{
                                            width: '100%',
                                            minHeight: '60px',
                                            padding: '8px 12px',
                                            border: '2px solid #4f46e5',
                                            borderRadius: '6px',
                                            fontSize: '14px',
                                            fontFamily: 'inherit',
                                            resize: 'vertical',
                                            outline: 'none',
                                            backgroundColor: 'white',
                                            color: '#000'
                                          }}
                                        />
                                      ) : (
                                        <div
                                          onClick={() => startEdit(key)}
                                          style={{
                                            padding: '8px 12px',
                                            backgroundColor: value ? 'rgba(255,255,255,0.8)' : 'rgba(239, 68, 68, 0.1)',
                                            borderRadius: '6px',
                                            border: '1px solid rgba(0,0,0,0.1)',
                                            cursor: 'pointer',
                                            minHeight: '36px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            fontSize: '14px',
                                            color: value ? '#374151' : '#9ca3af',
                                            fontStyle: value ? 'normal' : 'italic',
                                            transition: 'all 0.2s ease',
                                            wordBreak: 'break-word'
                                          }}
                                          onMouseEnter={(e) => {
                                            e.currentTarget.style.backgroundColor = value ? 'rgba(255,255,255,0.95)' : 'rgba(239, 68, 68, 0.15)';
                                          }}
                                          onMouseLeave={(e) => {
                                            e.currentTarget.style.backgroundColor = value ? 'rgba(255,255,255,0.8)' : 'rgba(239, 68, 68, 0.1)';
                                          }}
                                        >
                                          {value || `Click to add ${currentLang.toUpperCase()} translation...`}
                                        </div>
                                      )}
                                    </div>
                                    
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end' }}>
                                      {isEditing ? (
                                        <div style={{ display: 'flex', gap: '4px' }}>
                                          <button
                                            onClick={saveEdit}
                                            style={{
                                              padding: '4px 8px',
                                              backgroundColor: '#10b981',
                                              color: 'white',
                                              border: 'none',
                                              borderRadius: '4px',
                                              cursor: 'pointer',
                                              fontSize: '12px',
                                              fontWeight: '600'
                                            }}
                                          >
                                            <Check size={12} />
                                          </button>
                                          <button
                                            onClick={cancelEdit}
                                            style={{
                                              padding: '4px 8px',
                                              backgroundColor: '#ef4444',
                                              color: 'white',
                                              border: 'none',
                                              borderRadius: '4px',
                                              cursor: 'pointer',
                                              fontSize: '12px',
                                              fontWeight: '600'
                                            }}
                                          >
                                            <X size={12} />
                                          </button>
                                        </div>
                                      ) : (
                                        <button
                                          onClick={() => startEdit(key)}
                                          style={{
                                            padding: '4px 8px',
                                            backgroundColor: '#4f46e5',
                                            color: 'white',
                                            border: 'none',
                                            borderRadius: '4px',
                                            cursor: 'pointer',
                                            fontSize: '12px',
                                            fontWeight: '600',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '4px'
                                          }}
                                        >
                                          <Edit3 size={12} />
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                // Flat/Virtual Scrolling View
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
                      <div key={key} 
className=""
                        style={{
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
                        overflow: 'visible',
                        opacity: 1
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
              )}
            </div>
            
            {/* Resize Handle */}
            <div 
              className="resize-handle"
              onMouseDown={handleResizeStart}
              title="Drag to resize modal"
            />
          </div>
        </div>
      )}
      
      {/* Add Language Modal */}
      {showAddLanguageModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10001
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '16px',
            padding: '24px',
            width: '400px',
            maxWidth: '90vw',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '20px'
            }}>
              <h3 style={{
                margin: 0,
                fontSize: '18px',
                fontWeight: '600',
                color: '#333',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <Plus size={20} style={{ color: '#4f46e5' }} />
                Add New Language
              </h3>
              <button
                onClick={() => setShowAddLanguageModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '20px',
                  cursor: 'pointer',
                  color: '#999',
                  padding: '4px'
                }}
              >
                ×
              </button>
            </div>
            
            <div style={{ marginBottom: '20px' }}>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                fontSize: '14px',
                fontWeight: '600',
                color: '#374151'
              }}>
                Language Code
              </label>
              <input
                type="text"
                value={newLang}
                onChange={(e) => setNewLang(e.target.value)}
                placeholder="e.g., fr, de, ja, es"
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  border: '2px solid #e2e8f0',
                  borderRadius: '8px',
                  fontSize: '14px',
                  outline: 'none',
                  transition: 'border-color 0.2s ease',
                  boxSizing: 'border-box',
                  backgroundColor: 'white',
                  color: 'black'
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = '#4f46e5';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = '#e2e8f0';
                }}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && newLang.trim()) {
                    addLanguage();
                    setShowAddLanguageModal(false);
                  }
                }}
                autoFocus
              />
              <p style={{
                margin: '8px 0 12px 0',
                fontSize: '12px',
                color: '#6b7280'
              }}>
                Enter a language code (e.g., "fr" for French, "de" for German)
              </p>
              
              {/* Existing Languages Dropdown */}
              {Object.keys(globalTranslations).length > 0 && (
                <div style={{ marginTop: '16px' }}>
                  <label style={{
                    display: 'block',
                    marginBottom: '8px',
                    fontSize: '14px',
                    fontWeight: '600',
                    color: '#374151'
                  }}>
                    Existing Languages
                  </label>
                  <div style={{
                    padding: '12px',
                    backgroundColor: '#f9fafb',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '13px'
                  }}>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {Object.keys(globalTranslations).map(lang => (
                        <span
                          key={lang}
                          style={{
                            padding: '4px 8px',
                            backgroundColor: '#4f46e5',
                            color: 'white',
                            borderRadius: '12px',
                            fontSize: '12px',
                            fontWeight: '600',
                            textTransform: 'uppercase'
                          }}
                        >
                          {lang}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            <div style={{
              display: 'flex',
              gap: '12px',
              justifyContent: 'flex-end'
            }}>
              <button
                onClick={() => setShowAddLanguageModal(false)}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#f3f4f6',
                  color: '#374151',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '600'
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (newLang.trim()) {
                    addLanguage();
                    setShowAddLanguageModal(false);
                  }
                }}
                disabled={!newLang.trim()}
                style={{
                  padding: '10px 20px',
                  backgroundColor: newLang.trim() ? '#4f46e5' : '#d1d5db',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: newLang.trim() ? 'pointer' : 'not-allowed',
                  fontSize: '14px',
                  fontWeight: '600',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Plus size={16} />
                Add Language
              </button>
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
export const t = enhancedT;

// Export all public API functions
const publicAPI = {
  t,
  getCurrentLang,
  setLang,
  getAvailableLanguages,
  subscribeToLanguageChange,
  unsubscribeFromLanguageChange,
  useMagicTranslate
};

// For CommonJS compatibility
// @ts-ignore
if (typeof module !== 'undefined' && module.exports) {
  // @ts-ignore
  module.exports = {
    ...publicAPI,
    default: MagicTranslateUI,
    MagicTranslateUI
  };
}

// For ES modules
export default {
  ...publicAPI,
  MagicTranslateUI
};

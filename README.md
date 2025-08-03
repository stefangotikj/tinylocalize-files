# 🪄 TinyLocalize

**The easiest translation system ever. Just one file, zero configuration.**

[![License](https://img.shields.io/badge/License-Custom-blue.svg)](LICENSE.md)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18+-blue.svg)](https://reactjs.org/)

Magic TinyLocalize is a **standalone translation system** that requires no setup, no providers, no configuration. Just drop one file into your React project and start translating!

## ✨ Features

- 🪄 **Zero Setup**: Just one import - no providers, no configuration, no setup steps
- 🎨 **Magic UI**: Beautiful floating translation manager appears automatically
- 🔍 **Smart Search**: Find translation keys instantly with built-in search bar
- 📁 **One-Click Export**: Export all translations to production JSON files
- 🌐 **Multi-Language**: Add languages with one click, switch instantly
- ⚡ **Instant Reactivity**: All changes update immediately - no refresh needed
- 🎯 **Auto-Discovery**: Translation keys appear in UI when you use `t('key')`
- 🔄 **Nested Keys**: Support for `t('user.profile.name')` dot notation
- 🧩 **Variable Interpolation**: `t('greeting', { name: 'John' })` with placeholder support
- 💾 **Smart Persistence**: localStorage for development, JSON files for production
- 🎛️ **Language Switcher**: Ready-to-use component for end users
- 🔧 **TypeScript Ready**: Full type safety and IntelliSense support
- 🚀 **Production Mode**: Automatically hides Magic UI in production builds

## 🚀 Quick Start

### 1. Copy the Magic File

Download [`.tsx` version](./docs/magic-translate.tsx) and place it in your `src/` folder.

### 2. Import and Use

**Basic usage (most common):**
```tsx
import { t } from '../magic-translate';

function MyComponent() {
  return (
    <div>
      <h1>{t('welcome.title')}</h1>
      <p>{t('user.greeting', { name: 'John' })}</p>
    </div>
  );
}
```

**For components that need to re-render when language changes:**
```tsx
import { t, useMagicTranslate } from '../magic-translate';

function MyComponent() {
  useMagicTranslate(); // Ensures re-render on language change
  return (
    <div>
      <h1>{t('welcome.title')}</h1>
      <p>{t('user.greeting', { name: 'John' })}</p>
    </div>
  );
}
```

### 3. Add Language Switcher (Optional)

```tsx
// For end users to switch languages
import LanguageSwitcher from '../LanguageSwitcher';

function Header() {
  return (
    <header>
      <h1>My App</h1>
      <LanguageSwitcher /> {/* Dropdown with flags */}
    </header>
  );
}
```

### 4. That's It! 🪄

- **Magic UI appears automatically** when you use `t()`
- **Search and filter** translation keys instantly
- **Edit translations** and see changes immediately
- **Add languages** with one click
- **Export for production** when ready
- **Zero configuration needed!**


## 🎯 New Features

- 🔍 Smart Search
- ⚡ Instant Reactivity
- 🎛️ LanguageSwitcher Component

### 🚀 Production Mode & Deployment

By default, the Magic UI is enabled in both development and production:
```tsx
const MAGIC_CONFIG = {
  enableUI: true, // Enable UI in both development and production
  // Set to false to completely disable the Magic UI
};
```

#### 🔧 Configuration Options

- **Enable in all environments** (default): `enableUI: true`
- **Disable completely**: `enableUI: false`
- **Development only**: `enableUI: process.env.NODE_ENV === 'development'`

#### 🚀 Deployment Troubleshooting

**Button not visible after deployment?** The Magic UI button should be visible on your Netlify/Vercel deployment. If you want to disable the Magic UI in production, you can set `enableUI: false` in the `MAGIC_CONFIG`.

**Note**: The Magic UI works great in production for content management, but you can disable it if you prefer a cleaner end-user experience.

## 💫 Usage

### Basic Translation

```tsx
// Just import and use - no hooks, no providers!
import { t } from '../magic-translate';

function MyComponent() {
  return <h1>{t('welcome.title')}</h1>;
}
```

### With Variable Interpolation

```tsx
function Greeting({ userName }: { userName: string }) {
  return <p>{t('greeting.message', { name: userName })}</p>;
}
```

### Language Switching

Download [`.tsx` version](./LanguageSwitcher.tsx) and place it in your `src/components` folder.


```tsx
// Use the included LanguageSwitcher component
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { t } from '../magic-translate';

function Header() {
  return (
    <header className="flex justify-between items-center p-4">
      <h1>{t('app.title')}</h1>
      <LanguageSwitcher />
    </header>
  );
}
```

## 📁 File Structure

```
/public
  /locales              # Production translation files (exported from Magic UI)
    en.json            # English translations
    fr.json            # French translations
    es.json            # Spanish translations (add as needed)
/src
  magic-translate.tsx   # ✨ The only file you need!
  LanguageSwitcher.tsx  # Ready-to-use language switcher component
  App.tsx
  main.tsx
```

**That's it!** TypeScript-ready, no hooks, no providers, no CLI scripts, no configuration files.

## Translation Files

Translation files are stored in `/public/locales/{lang}.json`. They support nested objects:

### Translation Function `t()`

```tsx
// Basic usage
t('welcome.title')

// With interpolation
t('greeting.message', { name: 'John', count: 5 })

// Nested keys
t('user.profile.settings.privacy')
```

### Available Languages

Add languages in `LanguageSwitcher.tsx`:

```tsx
const AVAILABLE_LANGUAGES: Language[] = [
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
  { code: 'es', name: 'Español', flag: '🇪🇸' },
  // Add more languages here
];
```


## Fallback Behavior

When a translation key is not found:

1. Returns `"TODO: Translate "{key}"` for missing keys
2. Logs a warning to the console
3. Gracefully handles nested key misses
4. Works even if the entire language file is missing

## Best Practices

### Use Descriptive Key Names

```tsx
// Good
t('user.profile.edit.button')
t('error.network.timeout')

// Avoid
t('btn1')
t('err')
```


### Keep Translations Consistent

Use the same interpolation variables across languages:

```json
// en.json
{ "greeting": "Hello, {{name}}!" }

// fr.json  
{ "greeting": "Bonjour, {{name}} !" }
```

## Troubleshooting

### Translations Not Loading

1. Check that files exist in `/public/locales/`
2. Verify JSON syntax is valid
3. Check browser console for network errors
4. Ensure the development server is serving static files

### Language Not Switching

1. Check that the language file exists
2. Verify localStorage is working in your browser
3. Check browser console for loading errors

## Contributing

1. Add new languages by creating `{lang}.json` files in `/public/locales/`
2. Update `AVAILABLE_LANGUAGES` in `LanguageSwitcher.tsx`
3. Test with different languages to ensure consistency

## License

MIT License - feel free to use in your projects!

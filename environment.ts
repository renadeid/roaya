/**
 * Development Environment Configuration
 * Roaya IT Website
 */
export const environment = {
  production: false,

  // API Configuration
  apiUrl: 'http://localhost:3001/api/v1',

  // Local admin sign-in. Used to prefill the login form in development only.
  adminLogin: {
    username: 'Super Admin',
    email: 'admin@roaya.ai',
    password: 'Admin@123456',
  },

  // Google Cloud Translation API
  // Instructions to get your API key:
  // 1. Go to https://console.cloud.google.com
  // 2. Create a new project or select existing
  // 3. Enable "Cloud Translation API"
  // 4. Go to Credentials → Create Credentials → API Key
  // 5. Restrict the key:
  //    - Application restrictions: HTTP referrers
  //    - Add: http://localhost:4200/*, https://your-domain.com/*
  //    - API restrictions: Cloud Translation API only
  // 6. Copy the key below
  googleTranslateApiKey: '', // Add your API key here

  // Translation settings
  translation: {
    // Enable/disable AI translation (fallback to static files if disabled)
    enableAI: true,
    // Source language (always English)
    sourceLang: 'en',
    // Supported target languages
    supportedLangs: ['ar', 'en'],
    // Cache TTL in days
    cacheTTLDays: 30,
    // Max characters per API request (to stay within free tier)
    maxCharsPerRequest: 5000,
  },

  // Analytics. Leave blank locally so dev traffic stays out of production reports.
  // Production values live in environment.prod.ts.
  googleAnalyticsId: '',
  googleAnalyticsUsesGtm: false,
  hotjarSiteId: '',
  contentsquareTagId: '',

  // Error Logging (Sentry)
  // Instructions to get your DSN:
  // 1. Go to https://sentry.io
  // 2. Create a new project (Angular)
  // 3. Copy the DSN from Project Settings → Client Keys
  // 4. Paste below (leave empty to disable Sentry)
  sentryDsn: '', // Leave empty to use console logging only
};

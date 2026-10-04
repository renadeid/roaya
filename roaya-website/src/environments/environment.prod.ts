/**
 * Production Environment Configuration
 * Roaya IT Website
 */
export const environment = {
  production: true,

  // API Configuration
  apiUrl: '/api/v1',

  // Production never prefills admin credentials.
  adminLogin: {
    username: '',
    email: '',
    password: '',
  },

  // Google Cloud Translation API
  // SECURITY: This key should be restricted to your production domain
  // Go to Google Cloud Console → Credentials → Edit API Key
  // Set HTTP referrers: https://roaya.co/*, https://www.roaya.co/*
  googleTranslateApiKey: '', // Add your restricted production API key

  // Translation settings
  translation: {
    enableAI: true,
    sourceLang: 'en',
    supportedLangs: ['ar', 'en'],
    cacheTTLDays: 30,
    maxCharsPerRequest: 5000,
  },

  // GA4 web stream verified in the signed-in Roaya property (roaya.co).
  // Hotjar Site ID is the number in the Hotjar tracking code (Sites & Organizations).
  googleAnalyticsId: 'G-MPRS7PSDC4',
  // This property is managed by the application, independently of legacy GTM.
  googleAnalyticsUsesGtm: false,
  hotjarSiteId: '',
  // Contentsquare tag ID (project 1060380 → Settings → Tag Manager).
  contentsquareTagId: '5cc66f91cb916',

  // Error Logging (Sentry)
  // SECURITY: Restrict this DSN to your production domain in Sentry settings
  // Go to Project Settings → Client Keys → Configure → Allowed Domains
  sentryDsn: '', // Add your production Sentry DSN here
};

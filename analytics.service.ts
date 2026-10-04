import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { VisitorTrackingService } from './visitor-tracking.service';

/**
 * Starts Google Analytics 4 and Hotjar after the visitor accepts the consent
 * banner.
 *
 * index.html already loads Google Tag Manager, and that container sends page
 * views for G-NPLQ20N4NX, including in-app route changes. This service does
 * not install a second Google tag in that case, because the second tag would
 * count every visit twice. Hotjar loads only when session recording was allowed.
 */
const ANALYTICS_CONSENT_KEY = 'ra_analytics_consent';
const RECORDING_CONSENT_KEY = 'ra_recording_consent';

interface HotjarFunction {
  (...args: unknown[]): void;
  q?: unknown[];
}

interface AnalyticsBrowser extends Window {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
  hj?: HotjarFunction;
  _hjSettings?: { hjid: number; hjsv: number };
}

@Injectable({
  providedIn: 'root'
})
export class AnalyticsService {
  private readonly router = inject(Router);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly visitorTracking = inject(VisitorTrackingService);

  private readonly ga4Id = environment.googleAnalyticsId;
  private readonly hotjarSiteId = environment.hotjarSiteId;
  private readonly contentsquareTagId = environment.contentsquareTagId;
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  private gaReady = false;
  private hotjarReady = false;
  private contentsquareReady = false;
  /** Path Hotjar captured on its own when the script was inserted. */
  private hotjarBootPath: string | null = null;
  private landingPath = '';
  private gtmOwnsLanding = false;
  private landingGaHitSkipped = false;

  constructor() {
    if (!this.isBrowser) return;

    this.landingPath = window.location.pathname + window.location.search;
    this.gtmOwnsLanding = environment.googleAnalyticsUsesGtm && this.containerAlreadySendsLandingHit();
    this.enableTracking();
    this.trackPageViews();
    document.addEventListener('click', event => {
      if (!(event.target instanceof Element)) return;
      const target = event.target.closest('a, button, [role="button"]');
      if (!target || target.closest('app-consent-banner, [data-analytics-ignore]')) return;
      let action = 'button';
      if (target instanceof HTMLAnchorElement) {
        const destination = new URL(target.href, window.location.origin);
        action = destination.protocol === 'mailto:' ? 'email'
          : destination.protocol === 'tel:' ? 'phone'
          : destination.hostname === 'wa.me' || destination.hostname === 'api.whatsapp.com' ? 'whatsapp'
          : destination.origin !== window.location.origin ? 'external_link' : 'internal_link';
      }
      // Only the control type is sent; never labels, email addresses or hrefs.
      this.sendAction('website_click', { action });
    }, { passive: true });
  }

  /**
   * Start third-party tracking once consent is stored.
   * Pass sendCurrentPage after a first-time accept, because the landing
   * navigation already happened before the visitor could answer the banner.
   */
  enableTracking(options?: { sendCurrentPage?: boolean }): void {
    if (!this.isBrowser || this.isDoNotTrack() || this.isAdminPath(window.location.pathname)) return;

    this.loadGoogleAnalytics();
    this.loadHotjar();
    this.loadContentsquare();

    if (options?.sendCurrentPage) {
      this.trackPageView(window.location.pathname + window.location.search);
    }
  }

  trackPageView(url: string): void {
    if (!this.isBrowser || this.isDoNotTrack() || !this.hasAnalyticsConsent()) return;

    const path = url.split('?')[0] ?? url;
    if (this.isAdminPath(path)) return;

    this.enableTracking();
    this.sendGaPageView(path);
    if (this.hasRecordingConsent()) this.sendHotjarState(path);
  }

  trackEvent(eventName: string, eventParams?: Record<string, unknown>): void {
    if (!this.isBrowser || this.isDoNotTrack() || !this.hasAnalyticsConsent()
      || this.isAdminPath(window.location.pathname)) return;

    this.enableTracking();
    // Never forward free-text search terms or contact information to vendors.
    const safeParams = Object.fromEntries(Object.entries(eventParams ?? {}).filter(
      ([key]) => !/email|phone|name|query|message|password|token/i.test(key),
    ));

    this.visitorTracking.trackCustomEvent(
      eventName,
      this.getEventCategory(eventName),
      safeParams,
    );

    this.sendAction(eventName, safeParams);
  }

  private sendAction(eventName: string, safeParams: Record<string, unknown>): void {
    if (!this.isBrowser || this.isDoNotTrack() || !this.hasAnalyticsConsent()
      || this.isAdminPath(window.location.pathname)) return;
    this.enableTracking();
    const browser = window as AnalyticsBrowser;
    if (this.gaReady && typeof browser.gtag === 'function') {
      browser.gtag('event', eventName, { ...safeParams, send_to: this.ga4Id });
    }
    if (this.hotjarReady && this.hasRecordingConsent()) browser.hj?.('event', eventName);
  }

  trackROICalculator(type: 'cloud' | 'email' | 'security', action: 'started' | 'completed' | 'lead_captured'): void {
    this.trackEvent('roi_calculator', {
      calculator_type: type,
      action: action
    });
    this.visitorTracking.trackCustomEvent(`roi_calculator_${action}`, 'conversion', {
      calculatorType: type,
    });
  }

  trackFormSubmission(formId: string, formType: 'contact' | 'roi_lead' | 'newsletter' | 'pricing_quote', success: boolean): void {
    if (success) {
      this.pushToDataLayer('form_submission_success', {
        formId,
        formType,
      });
    }
    this.trackEvent('form_submission', {
      form_id: formId,
      form_type: formType,
      success,
    });
    this.visitorTracking.trackCustomEvent(success ? 'lead_submit' : 'form_error', 'conversion', {
      formId,
      formType,
    });
  }

  trackContentEngagement(contentType: 'blog' | 'case_study' | 'whitepaper', contentId: string, action: 'view' | 'download' | 'share'): void {
    this.trackEvent('content_engagement', {
      content_type: contentType,
      content_id: contentId,
      action: action
    });
  }

  private trackPageViews(): void {
    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe((event: NavigationEnd) => {
        this.trackPageView(event.urlAfterRedirects);
      });
  }

  private loadGoogleAnalytics(): void {
    if (this.gaReady || !this.hasAnalyticsConsent() || !this.isGaId(this.ga4Id)) return;

    const browser = window as AnalyticsBrowser;
    browser.dataLayer = browser.dataLayer || [];
    browser.gtag = browser.gtag || function gtag(..._args: unknown[]) {
      // The Google tag consumes Arguments objects, matching its official snippet.
      browser.dataLayer?.push(arguments);
    };
    if (this.gtmOwnsLanding) {
      this.gaReady = true;
      return;
    }
    browser.gtag('js', new Date());
    browser.gtag('config', this.ga4Id, { send_page_view: false });

    if (!document.querySelector('script[data-roaya-analytics="ga4"]')) {
      const script = document.createElement('script');
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(this.ga4Id)}`;
      script.dataset['roayaAnalytics'] = 'ga4';
      document.head.appendChild(script);
    }

    this.gaReady = true;
  }

  private loadHotjar(): void {
    if (this.hotjarReady || !this.hasRecordingConsent() || !this.isHotjarId(this.hotjarSiteId)) return;

    const siteId = Number(this.hotjarSiteId);
    const browser = window as AnalyticsBrowser;
    browser.hj = browser.hj || function hotjar(...args: unknown[]) {
      (browser.hj as HotjarFunction).q = (browser.hj as HotjarFunction).q || [];
      (browser.hj as HotjarFunction).q?.push(args);
    };
    browser._hjSettings = { hjid: siteId, hjsv: 6 };

    if (!document.querySelector('script[data-roaya-analytics="hotjar"]')) {
      const script = document.createElement('script');
      script.async = true;
      script.src = `https://static.hotjar.com/c/hotjar-${siteId}.js?sv=6`;
      script.dataset['roayaAnalytics'] = 'hotjar';
      document.head.appendChild(script);
    }

    this.hotjarBootPath = window.location.pathname + window.location.search;
    this.hotjarReady = true;
  }

  private loadContentsquare(): void {
    if (this.contentsquareReady || !this.hasRecordingConsent() || !this.contentsquareTagId) return;

    if (!document.querySelector('script[data-roaya-analytics="contentsquare"]')) {
      const script = document.createElement('script');
      script.defer = true;
      script.src = `https://t.contentsquare.net/uxa/${encodeURIComponent(this.contentsquareTagId)}.js`;
      script.dataset['roayaAnalytics'] = 'contentsquare';
      document.head.appendChild(script);
    }

    this.contentsquareReady = true;
  }

  private sendGaPageView(url: string): void {
    if (!this.gaReady) return;
    // The existing GTM container owns page views; this service sends actions.
    if (this.gtmOwnsLanding) return;
    if (this.shouldSkipLandingHit(url)) return;

    const browser = window as AnalyticsBrowser;
    browser.gtag?.('event', 'page_view', {
      page_path: url,
      page_location: `${window.location.origin}${url}`,
      page_title: document.title,
    });
  }

  private sendHotjarState(url: string): void {
    if (!this.hotjarReady) return;
    if (this.hotjarBootPath !== null) {
      const bootPath = this.hotjarBootPath;
      this.hotjarBootPath = null;
      if (url === bootPath) return;
    }
    (window as AnalyticsBrowser).hj?.('stateChange', url);
  }

  /** GTM already sent this hit for the URL the browser opened on. */
  private shouldSkipLandingHit(url: string): boolean {
    if (!this.gtmOwnsLanding || this.landingGaHitSkipped) return false;
    this.landingGaHitSkipped = true;
    return url === this.landingPath;
  }

  private containerAlreadySendsLandingHit(): boolean {
    const layer = (window as AnalyticsBrowser).dataLayer;
    if (!Array.isArray(layer)) return false;
    return layer.some((entry) => {
      return !!entry && typeof entry === 'object' && 'gtm.start' in entry;
    });
  }

  private pushToDataLayer(event: string, data?: Record<string, unknown>): void {
    if (!this.isBrowser) return;
    const browser = window as AnalyticsBrowser;
    browser.dataLayer = browser.dataLayer || [];
    browser.dataLayer.push({ event, ...data });
  }

  private hasAnalyticsConsent(): boolean {
    try {
      return localStorage.getItem(ANALYTICS_CONSENT_KEY) === 'accepted';
    } catch {
      return false;
    }
  }

  private hasRecordingConsent(): boolean {
    try {
      return localStorage.getItem(RECORDING_CONSENT_KEY) === 'accepted';
    } catch {
      return false;
    }
  }

  private isDoNotTrack(): boolean {
    const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
    return navigator.doNotTrack === '1' || nav.globalPrivacyControl === true;
  }

  private isAdminPath(path: string): boolean {
    return path === '/admin' || path.startsWith('/admin/');
  }

  private isGaId(id: string): boolean {
    return /^G-[A-Z0-9]+$/.test(id);
  }

  private isHotjarId(id: string): boolean {
    return /^[0-9]+$/.test(id);
  }

  private getEventCategory(eventName: string): 'conversion' | 'engagement' | 'behavior' | 'error' {
    if (/submit|signup|lead|roi|quote|contact/i.test(eventName)) return 'conversion';
    if (/error|failed|exception/i.test(eventName)) return 'error';
    if (/rage|dead|scroll/i.test(eventName)) return 'behavior';
    return 'engagement';
  }
}



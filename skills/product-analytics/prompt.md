---
name: product-analytics
description: "Product analytics - event taxonomy, funnel analysis, A/B testing, retention metrikleri."
---

# Product Analytics

## Event Taxonomy Design

### Event Naming Convention

```
<object>_<action>

Ornekler:
  user_signed_up
  page_viewed
  button_clicked
  feature_activated
  subscription_started
  payment_completed
  item_added_to_cart
  search_performed
```

### Event Schema (TypeScript)

```typescript
interface AnalyticsEvent {
  event_name: string;
  timestamp: string;           // ISO 8601
  user_id: string;
  anonymous_id?: string;       // pre-auth tracking
  session_id: string;
  properties: Record<string, unknown>;
  context: EventContext;
}

interface EventContext {
  app_version: string;
  platform: "web" | "ios" | "android";
  locale: string;
  timezone: string;
  page_url?: string;
  referrer?: string;
  utm?: UTMParams;
  device?: DeviceInfo;
}

interface UTMParams {
  source?: string;
  medium?: string;
  campaign?: string;
  term?: string;
  content?: string;
}
```

### Event Categories

| Kategori | Ornek Eventler | Amac |
|----------|---------------|------|
| Identity | user_signed_up, user_logged_in | Kim? |
| Navigation | page_viewed, tab_switched | Nerede? |
| Interaction | button_clicked, form_submitted | Ne yapti? |
| Transaction | purchase_completed, subscription_started | Para akisi |
| Feature | feature_activated, feature_used | Deger bulma |
| System | error_occurred, api_timeout | Saglik |

### Tracking Plan Template

```typescript
const trackingPlan = {
  "user_signed_up": {
    description: "Kullanici kayit tamamladi",
    properties: {
      method: { type: "string", enum: ["email", "google", "github"], required: true },
      referral_code: { type: "string", required: false },
      plan: { type: "string", enum: ["free", "pro", "enterprise"], required: true },
    },
    triggers: ["Registration form submit"],
    owner: "growth-team",
  },
  "feature_activated": {
    description: "Kullanici bir feature'u ilk kez kulandi",
    properties: {
      feature_name: { type: "string", required: true },
      activation_method: { type: "string", required: true },
      time_since_signup_hours: { type: "number", required: true },
    },
    triggers: ["First use of any tracked feature"],
    owner: "product-team",
  },
};
```

## AARRR Funnel (Pirate Metrics)

### Funnel Tanimlari

```
Acquisition  --> Activation  --> Retention  --> Revenue  --> Referral
(Edinme)        (Aktiflesme)    (Tutunma)     (Gelir)      (Yonlendirme)
```

| Stage | Tanim | Ornek Metrik | Hedef |
|-------|-------|-------------|-------|
| Acquisition | Kullanici siteye geldi | Unique visitors, signup rate | %3-5 signup |
| Activation | "Aha moment" yasandi | Onboarding completion, first value | %40-60 activation |
| Retention | Geri geldi | D1/D7/D30 retention | D7 > %20 |
| Revenue | Para odedi | Conversion to paid, ARPU | %2-5 conversion |
| Referral | Baskasini getirdi | Invite sent, viral coefficient | K > 0.5 |

### Funnel Analysis Query

```sql
-- Acquisition -> Activation -> Retention funnel
WITH funnel AS (
  SELECT
    user_id,
    MIN(CASE WHEN event = 'user_signed_up' THEN timestamp END) AS signed_up_at,
    MIN(CASE WHEN event = 'onboarding_completed' THEN timestamp END) AS activated_at,
    MIN(CASE WHEN event = 'feature_used' AND day_number >= 7 THEN timestamp END) AS retained_at,
    MIN(CASE WHEN event = 'subscription_started' THEN timestamp END) AS converted_at
  FROM events
  WHERE timestamp >= CURRENT_DATE - INTERVAL '30 days'
  GROUP BY user_id
)
SELECT
  COUNT(signed_up_at) AS acquisitions,
  COUNT(activated_at) AS activations,
  ROUND(100.0 * COUNT(activated_at) / NULLIF(COUNT(signed_up_at), 0), 1) AS activation_rate,
  COUNT(retained_at) AS retained,
  ROUND(100.0 * COUNT(retained_at) / NULLIF(COUNT(activated_at), 0), 1) AS retention_rate,
  COUNT(converted_at) AS converted,
  ROUND(100.0 * COUNT(converted_at) / NULLIF(COUNT(retained_at), 0), 1) AS conversion_rate
FROM funnel;
```

## Cohort Analysis

### Retention Cohort Query

```sql
-- Weekly retention cohort
WITH user_cohort AS (
  SELECT
    user_id,
    DATE_TRUNC('week', MIN(timestamp)) AS cohort_week
  FROM events
  WHERE event = 'user_signed_up'
  GROUP BY user_id
),
user_activity AS (
  SELECT
    e.user_id,
    uc.cohort_week,
    DATE_TRUNC('week', e.timestamp) AS activity_week,
    (DATE_TRUNC('week', e.timestamp) - uc.cohort_week) / 7 AS week_number
  FROM events e
  JOIN user_cohort uc ON e.user_id = uc.user_id
)
SELECT
  cohort_week,
  week_number,
  COUNT(DISTINCT user_id) AS active_users,
  ROUND(100.0 * COUNT(DISTINCT user_id) /
    FIRST_VALUE(COUNT(DISTINCT user_id)) OVER (
      PARTITION BY cohort_week ORDER BY week_number
    ), 1) AS retention_pct
FROM user_activity
GROUP BY cohort_week, week_number
ORDER BY cohort_week, week_number;
```

### Cohort Visualization Data

```typescript
interface CohortData {
  cohort: string;         // "2026-W01"
  size: number;           // cohort buyuklugu
  retention: number[];    // [100, 45, 32, 28, 25, 23, 22, 21]
}

function buildCohortTable(cohorts: CohortData[]): string[][] {
  const header = ["Cohort", "Size", "W0", "W1", "W2", "W3", "W4", "W5", "W6", "W7"];
  const rows = cohorts.map(c => [
    c.cohort,
    String(c.size),
    ...c.retention.map(r => `${r}%`),
  ]);
  return [header, ...rows];
}
```

## A/B Testing Framework

### Experiment Design

```typescript
interface Experiment {
  id: string;
  name: string;
  hypothesis: string;                    // "X degisikligi Y metrigini Z kadar arttirir"
  primary_metric: string;                // tek bir karar metrigi
  secondary_metrics: string[];
  guardrail_metrics: string[];           // bozulmamasi gereken metrikler
  variants: Variant[];
  traffic_allocation: number;            // %10-50 arasi basla
  min_sample_size: number;
  min_duration_days: number;
  status: "draft" | "running" | "analyzing" | "completed";
}

interface Variant {
  id: string;
  name: string;                          // "control" | "treatment_a" | "treatment_b"
  weight: number;                        // 0.5 = %50
  description: string;
}
```

### Sample Size Calculator

```typescript
function calculateSampleSize(
  baselineRate: number,       // mevcut conversion rate (0.05 = %5)
  mde: number,                // minimum detectable effect (0.10 = %10 relative)
  alpha: number = 0.05,       // significance level
  power: number = 0.80        // statistical power
): number {
  const p1 = baselineRate;
  const p2 = baselineRate * (1 + mde);
  const zAlpha = 1.96;        // two-tailed
  const zBeta = 0.84;

  const pooledP = (p1 + p2) / 2;
  const numerator = Math.pow(
    zAlpha * Math.sqrt(2 * pooledP * (1 - pooledP)) +
    zBeta * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2)),
    2
  );
  const denominator = Math.pow(p1 - p2, 2);

  return Math.ceil(numerator / denominator);
}

// Ornek: %5 baseline, %10 relative MDE
// calculateSampleSize(0.05, 0.10) => ~31,000 per variant
```

### Statistical Significance Check

```typescript
function checkSignificance(
  controlConversions: number,
  controlTotal: number,
  treatmentConversions: number,
  treatmentTotal: number
): { significant: boolean; pValue: number; lift: number; ci: [number, number] } {
  const p1 = controlConversions / controlTotal;
  const p2 = treatmentConversions / treatmentTotal;
  const pooledP = (controlConversions + treatmentConversions) / (controlTotal + treatmentTotal);
  const se = Math.sqrt(pooledP * (1 - pooledP) * (1 / controlTotal + 1 / treatmentTotal));
  const z = (p2 - p1) / se;
  const pValue = 2 * (1 - normalCDF(Math.abs(z)));
  const lift = (p2 - p1) / p1;
  const liftSE = Math.sqrt(p2 * (1 - p2) / treatmentTotal + p1 * (1 - p1) / controlTotal) / p1;
  const ci: [number, number] = [lift - 1.96 * liftSE, lift + 1.96 * liftSE];

  return {
    significant: pValue < 0.05,
    pValue: Math.round(pValue * 10000) / 10000,
    lift: Math.round(lift * 10000) / 10000,
    ci,
  };
}
```

## Feature Adoption Metrics

### Adoption Funnel

```
Aware --> Tried --> Adopted --> Power User
  |        |         |            |
  v        v         v            v
Feature   First    Regular     Advanced
exposed   use      use (3+)    patterns
```

### Adoption Tracking

```typescript
interface FeatureAdoption {
  feature_name: string;
  aware_users: number;          // feature'u goren
  tried_users: number;          // 1 kez kullanan
  adopted_users: number;        // 3+ kez kullanan (haftalik)
  power_users: number;          // advanced kullanim yapan
  trial_rate: number;           // tried / aware
  adoption_rate: number;        // adopted / tried
  time_to_adopt_median: number; // gun cinsinden
}
```

### Feature Adoption Query

```sql
SELECT
  feature_name,
  COUNT(DISTINCT CASE WHEN times_used >= 1 THEN user_id END) AS tried,
  COUNT(DISTINCT CASE WHEN times_used >= 3 THEN user_id END) AS adopted,
  COUNT(DISTINCT CASE WHEN times_used >= 10 THEN user_id END) AS power_users,
  ROUND(AVG(CASE WHEN times_used >= 3
    THEN EXTRACT(EPOCH FROM adopted_at - first_used_at) / 86400
  END), 1) AS median_days_to_adopt
FROM (
  SELECT
    user_id,
    properties->>'feature_name' AS feature_name,
    COUNT(*) AS times_used,
    MIN(timestamp) AS first_used_at,
    MIN(CASE WHEN rn >= 3 THEN timestamp END) AS adopted_at
  FROM (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY user_id, properties->>'feature_name' ORDER BY timestamp) AS rn
    FROM events WHERE event = 'feature_used'
  ) sub
  GROUP BY user_id, properties->>'feature_name'
) adoption
GROUP BY feature_name;
```

## User Segmentation

### RFM Segmentation

```sql
-- Recency, Frequency, Monetary segmentation
WITH rfm AS (
  SELECT
    user_id,
    CURRENT_DATE - MAX(event_date)::date AS recency_days,
    COUNT(DISTINCT event_date) AS frequency,
    COALESCE(SUM(revenue), 0) AS monetary
  FROM events
  WHERE timestamp >= CURRENT_DATE - INTERVAL '90 days'
  GROUP BY user_id
),
rfm_scored AS (
  SELECT *,
    NTILE(5) OVER (ORDER BY recency_days DESC) AS r_score,
    NTILE(5) OVER (ORDER BY frequency) AS f_score,
    NTILE(5) OVER (ORDER BY monetary) AS m_score
  FROM rfm
)
SELECT
  user_id,
  CASE
    WHEN r_score >= 4 AND f_score >= 4 THEN 'Champion'
    WHEN r_score >= 3 AND f_score >= 3 THEN 'Loyal'
    WHEN r_score >= 4 AND f_score <= 2 THEN 'New Customer'
    WHEN r_score <= 2 AND f_score >= 3 THEN 'At Risk'
    WHEN r_score <= 2 AND f_score <= 2 THEN 'Hibernating'
    ELSE 'Potential Loyalist'
  END AS segment,
  r_score, f_score, m_score
FROM rfm_scored;
```

### Behavioral Segments

| Segment | Tanim | Aksiyon |
|---------|-------|--------|
| Power Users | Gunluk aktif, 5+ feature kullanan | Feedback al, beta tester yap |
| Regular | Haftalik aktif, core feature kullanan | Yeni feature'lari tanitit |
| Casual | Aylik aktif, tek feature kullanan | Onboarding iyilestir |
| At Risk | 14+ gun inaktif, onceden aktifti | Win-back email gonder |
| Dormant | 30+ gun inaktif | Re-engagement kampanyasi |
| New | Son 7 gunde kayit olmus | Onboarding optimize et |

## Mixpanel/Amplitude/PostHog Event Schema

### Provider-Agnostic Tracker

```typescript
interface AnalyticsProvider {
  track(event: string, properties?: Record<string, unknown>): void;
  identify(userId: string, traits?: Record<string, unknown>): void;
  page(name: string, properties?: Record<string, unknown>): void;
  group(groupId: string, traits?: Record<string, unknown>): void;
  reset(): void;
}

class Analytics {
  private providers: AnalyticsProvider[] = [];

  addProvider(provider: AnalyticsProvider): void {
    this.providers.push(provider);
  }

  track(event: string, properties?: Record<string, unknown>): void {
    const enriched = {
      ...properties,
      timestamp: new Date().toISOString(),
      session_id: this.getSessionId(),
      app_version: this.getAppVersion(),
    };
    this.providers.forEach(p => p.track(event, enriched));
  }

  identify(userId: string, traits?: Record<string, unknown>): void {
    this.providers.forEach(p => p.identify(userId, traits));
  }

  private getSessionId(): string { /* session management */ return ""; }
  private getAppVersion(): string { return process.env.APP_VERSION || "unknown"; }
}

// PostHog implementation
class PostHogProvider implements AnalyticsProvider {
  track(event: string, properties?: Record<string, unknown>): void {
    posthog.capture(event, properties);
  }
  identify(userId: string, traits?: Record<string, unknown>): void {
    posthog.identify(userId, traits);
  }
  page(name: string, properties?: Record<string, unknown>): void {
    posthog.capture("$pageview", { page_name: name, ...properties });
  }
  group(groupId: string, traits?: Record<string, unknown>): void {
    posthog.group("company", groupId, traits);
  }
  reset(): void {
    posthog.reset();
  }
}
```

## DAU/MAU/WAU Tracking

### Engagement Ratio Query

```sql
-- DAU/MAU ratio (stickiness)
WITH daily AS (
  SELECT DATE_TRUNC('day', timestamp) AS day, COUNT(DISTINCT user_id) AS dau
  FROM events WHERE timestamp >= CURRENT_DATE - INTERVAL '30 days'
  GROUP BY 1
),
monthly AS (
  SELECT COUNT(DISTINCT user_id) AS mau
  FROM events WHERE timestamp >= CURRENT_DATE - INTERVAL '30 days'
)
SELECT
  d.day,
  d.dau,
  m.mau,
  ROUND(100.0 * d.dau / m.mau, 1) AS stickiness_pct
FROM daily d CROSS JOIN monthly m
ORDER BY d.day;

-- Benchmark: stickiness > %20 iyi, > %50 mukemmel (social apps)
```

## Retention Curves

### Retention Query (Day-based)

```sql
SELECT
  day_number,
  COUNT(DISTINCT user_id) AS returning_users,
  ROUND(100.0 * COUNT(DISTINCT user_id) /
    (SELECT COUNT(DISTINCT user_id) FROM events
     WHERE event = 'user_signed_up'
     AND timestamp >= CURRENT_DATE - INTERVAL '90 days'), 1) AS retention_pct
FROM (
  SELECT
    e.user_id,
    (e.timestamp::date - u.signup_date::date) AS day_number
  FROM events e
  JOIN (
    SELECT user_id, MIN(timestamp) AS signup_date
    FROM events WHERE event = 'user_signed_up'
    AND timestamp >= CURRENT_DATE - INTERVAL '90 days'
    GROUP BY user_id
  ) u ON e.user_id = u.user_id
) days
WHERE day_number IN (0, 1, 3, 7, 14, 30, 60, 90)
GROUP BY day_number
ORDER BY day_number;
```

### Retention Benchmarks

| Urun Tipi | D1 | D7 | D30 | D90 |
|-----------|----|----|-----|-----|
| SaaS B2B | %80 | %60 | %45 | %35 |
| SaaS B2C | %40 | %20 | %10 | %5 |
| Mobile App | %35 | %15 | %6 | %3 |
| E-commerce | %25 | %12 | %5 | %2 |
| Social/Community | %50 | %30 | %15 | %10 |

## LTV Calculation

### Simple LTV

```typescript
function calculateLTV(
  arpu: number,              // Average Revenue Per User (aylik)
  grossMargin: number,       // %70 = 0.70
  churnRate: number           // aylik churn %5 = 0.05
): number {
  // LTV = ARPU * Gross Margin / Churn Rate
  return (arpu * grossMargin) / churnRate;
}

// Ornek: $50 ARPU, %80 margin, %5 churn
// LTV = 50 * 0.80 / 0.05 = $800
```

### Cohort-based LTV

```sql
SELECT
  cohort_month,
  months_since_signup,
  SUM(revenue) AS cumulative_revenue,
  COUNT(DISTINCT user_id) AS cohort_size,
  ROUND(SUM(revenue) / COUNT(DISTINCT user_id), 2) AS ltv_per_user
FROM (
  SELECT
    u.cohort_month,
    e.user_id,
    EXTRACT(MONTH FROM AGE(e.timestamp, u.signup_date)) AS months_since_signup,
    SUM(e.revenue) OVER (
      PARTITION BY e.user_id ORDER BY e.timestamp
    ) AS revenue
  FROM events e
  JOIN (
    SELECT user_id, MIN(timestamp) AS signup_date,
           DATE_TRUNC('month', MIN(timestamp)) AS cohort_month
    FROM events WHERE event = 'user_signed_up'
    GROUP BY user_id
  ) u ON e.user_id = u.user_id
  WHERE e.revenue > 0
) ltv
GROUP BY cohort_month, months_since_signup
ORDER BY cohort_month, months_since_signup;
```

### LTV:CAC Ratio

| Ratio | Anlam | Aksiyon |
|-------|-------|--------|
| < 1:1 | Para kaybediyorsun | Acil: CAC dusur veya retention artir |
| 1:1 - 3:1 | Basabas veya az karli | Optimize et |
| 3:1 - 5:1 | Saglikli | Buyumeye yatirim yap |
| > 5:1 | Cok iyi ama belki az harciyorsun | Daha agresif buyume dene |

## Churn Prediction Signals

### Early Warning Signals

```typescript
interface ChurnSignal {
  signal: string;
  weight: number;        // 0-1, yuksek = guclu sinyal
  threshold: string;
  action: string;
}

const churnSignals: ChurnSignal[] = [
  {
    signal: "login_frequency_drop",
    weight: 0.9,
    threshold: "Son 7 gun login < onceki 7 gunun %50'si",
    action: "Re-engagement email + in-app mesaj",
  },
  {
    signal: "feature_usage_decline",
    weight: 0.8,
    threshold: "Core feature kullanimi %60 dustu",
    action: "Proaktif CS outreach",
  },
  {
    signal: "support_ticket_spike",
    weight: 0.7,
    threshold: "Son 14 gunde 3+ ticket",
    action: "CS manager escalation",
  },
  {
    signal: "no_team_invite",
    weight: 0.6,
    threshold: "30 gundur takim uyesi eklemedi",
    action: "Collaboration feature highlight",
  },
  {
    signal: "billing_page_visit",
    weight: 0.5,
    threshold: "Billing/cancel sayfasini 2+ kez ziyaret",
    action: "Retention offer popup",
  },
];
```

### Churn Score Query

```sql
SELECT
  user_id,
  ROUND(
    0.3 * CASE WHEN days_since_last_login > 7 THEN 1 ELSE days_since_last_login / 7.0 END +
    0.25 * CASE WHEN feature_usage_change < -0.5 THEN 1 ELSE ABS(LEAST(feature_usage_change, 0)) * 2 END +
    0.20 * CASE WHEN support_tickets_14d >= 3 THEN 1 ELSE support_tickets_14d / 3.0 END +
    0.15 * CASE WHEN team_size <= 1 THEN 1 ELSE 0 END +
    0.10 * CASE WHEN visited_cancel_page THEN 1 ELSE 0 END
  , 2) AS churn_risk_score
FROM user_health_metrics
ORDER BY churn_risk_score DESC;
```

## Dashboard KPI Template

### Executive Dashboard

| Kategori | Metrik | Hedef | Formul |
|----------|--------|-------|--------|
| Growth | MRR | +10% MoM | sum(active_subscriptions * price) |
| Growth | New Signups | +15% MoM | count(user_signed_up) |
| Engagement | DAU/MAU | > %25 | daily_active / monthly_active |
| Engagement | Avg Session Duration | > 5 min | avg(session_end - session_start) |
| Retention | D7 Retention | > %25 | returning_d7 / signed_up |
| Retention | Net Revenue Retention | > %110 | (MRR + expansion - contraction - churn) / MRR_prev |
| Revenue | LTV | > 3x CAC | ARPU * margin / churn_rate |
| Revenue | ARPU | +5% QoQ | total_revenue / active_users |
| Health | NPS | > 50 | promoters_pct - detractors_pct |
| Health | Churn Rate | < %5 | churned_users / start_of_month_users |

## Anti-Patterns

| Anti-Pattern | Dogru Yol |
|-------------|-----------|
| Her seyi track etmek | Sorulari belirle, sonra event tanimla |
| Event isimlerinde tutarsizlik | Naming convention + tracking plan |
| A/B test'i erken bitirmek | Sample size ve duration hesapla |
| Vanity metrics'e odaklanmak | Actionable metrikler sec |
| Segmentsiz analiz | Her metrigi segmentlere bol |
| Tek retention metrigi | D1/D7/D30 + cohort bazli bak |

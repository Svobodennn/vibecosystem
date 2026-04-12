---
name: competitive-analysis
description: "Competitive analysis - feature matrix, SWOT, market positioning, benchmark."
---

# Competitive Analysis

## Competitor Identification ve Mapping

### Competitor Categories

```
Direct Competitors        Indirect Competitors       Potential Competitors
(Ayni problem, ayni cozum) (Ayni problem, farkli cozum) (Farkli problem, genisleyebilir)
|                          |                            |
v                          v                            v
Figma vs Sketch            Figma vs PowerPoint          Figma vs Canva
Slack vs Teams             Slack vs Email               Slack vs Discord
Linear vs Jira             Linear vs Spreadsheet        Linear vs Notion
```

### Competitor Map Template

```typescript
interface Competitor {
  name: string;
  category: "direct" | "indirect" | "potential";
  website: string;
  founding_year: number;
  funding_total?: string;
  employee_count_range: string;
  pricing_model: string;
  target_market: string[];
  key_features: string[];
  weaknesses: string[];
  market_share_estimate?: string;
  growth_signals: string[];
}

const competitorMap: Competitor[] = [
  {
    name: "Competitor A",
    category: "direct",
    website: "https://competitor-a.com",
    founding_year: 2018,
    funding_total: "$50M Series B",
    employee_count_range: "100-250",
    pricing_model: "Freemium + per-seat",
    target_market: ["SMB", "Mid-market"],
    key_features: [
      "Real-time collaboration",
      "API-first architecture",
      "Native integrations",
    ],
    weaknesses: [
      "Enterprise features eksik",
      "Mobile app zayif",
      "Customer support yavash",
    ],
    market_share_estimate: "~15%",
    growth_signals: [
      "Son 6 ayda 3 buyuk feature launch",
      "LinkedIn job posting %40 artti",
      "G2 review sayisi 2x",
    ],
  },
];
```

### Competitive Landscape Matrix

```
              High Price
                 |
    Enterprise   |   Premium
    (Oracle,     |   (Salesforce,
     SAP)        |    HubSpot)
                 |
  Low Feature ---+--- High Feature
                 |
    Budget       |   PLG/Modern
    (Open        |   (Linear,
     Source)      |    Notion)
                 |
              Low Price
```

## Feature Comparison Matrix

### Feature Matrix Template

```typescript
interface FeatureMatrix {
  categories: Array<{
    name: string;
    features: Array<{
      name: string;
      importance: "must_have" | "nice_to_have" | "differentiator";
      our_product: FeatureStatus;
      competitors: Record<string, FeatureStatus>;
    }>;
  }>;
}

type FeatureStatus =
  | { status: "full"; notes?: string }
  | { status: "partial"; notes: string }
  | { status: "none" }
  | { status: "planned"; eta?: string }
  | { status: "superior"; notes: string };

const featureMatrix: FeatureMatrix = {
  categories: [
    {
      name: "Core Features",
      features: [
        {
          name: "Real-time collaboration",
          importance: "must_have",
          our_product: { status: "full" },
          competitors: {
            "Competitor A": { status: "full" },
            "Competitor B": { status: "partial", notes: "Sadece edit, comment yok" },
            "Competitor C": { status: "none" },
          },
        },
        {
          name: "AI-powered automation",
          importance: "differentiator",
          our_product: { status: "superior", notes: "GPT-4 entegrasyon + custom models" },
          competitors: {
            "Competitor A": { status: "partial", notes: "Temel AI oneriler" },
            "Competitor B": { status: "planned", eta: "Q3 2026" },
            "Competitor C": { status: "none" },
          },
        },
      ],
    },
  ],
};
```

### Feature Comparison Visualization

```
Feature              Us    Comp A   Comp B   Comp C
------------------------------------------------------
Real-time collab     [##]   [##]     [#-]     [--]
AI automation        [##]   [#-]     [..]     [--]
API access           [##]   [##]     [##]     [#-]
Mobile app           [#-]   [##]     [--]     [##]
Enterprise SSO       [##]   [##]     [#-]     [--]
Custom workflows     [##]   [#-]     [--]     [--]
Integrations         [#-]   [##]     [#-]     [#-]

Legend: [##] Full  [#-] Partial  [--] None  [..] Planned
```

## SWOT Analysis

### SWOT Framework

```typescript
interface SWOTAnalysis {
  company: string;
  date: string;
  strengths: SWOTItem[];
  weaknesses: SWOTItem[];
  opportunities: SWOTItem[];
  threats: SWOTItem[];
  strategies: {
    SO: string[];    // Strengths + Opportunities: Agresif strateji
    WO: string[];    // Weaknesses + Opportunities: Gelistirme stratejisi
    ST: string[];    // Strengths + Threats: Savunma stratejisi
    WT: string[];    // Weaknesses + Threats: Kacis/pivot stratejisi
  };
}

interface SWOTItem {
  item: string;
  impact: "high" | "medium" | "low";
  evidence: string;
  actionable: boolean;
}

const swot: SWOTAnalysis = {
  company: "Our Product",
  date: "2026-Q1",
  strengths: [
    {
      item: "AI-first architecture",
      impact: "high",
      evidence: "Rakiplerden 2 yil once AI entegrasyonu",
      actionable: true,
    },
    {
      item: "Developer community (10K+)",
      impact: "high",
      evidence: "GitHub stars, Discord members, contributor sayisi",
      actionable: true,
    },
  ],
  weaknesses: [
    {
      item: "Enterprise sales team yok",
      impact: "high",
      evidence: "Enterprise deal'lar self-serve ile gelmiyor",
      actionable: true,
    },
  ],
  opportunities: [
    {
      item: "AI regulation yeni standartlar getiriyor",
      impact: "medium",
      evidence: "EU AI Act, compliance araci talep artisi",
      actionable: true,
    },
  ],
  threats: [
    {
      item: "Big tech ayni alana giriyor",
      impact: "high",
      evidence: "Google/Microsoft benzer urun duyurdu",
      actionable: true,
    },
  ],
  strategies: {
    SO: [
      "AI-first avantajini marketing'de one cikar",
      "Community'yi enterprise referral kanalina cevir",
    ],
    WO: [
      "Channel partner programi ile enterprise'a eris",
      "AI compliance tool olarak repositioning",
    ],
    ST: [
      "Open source core ile lock-in endisesini gider",
      "Niche (developer tools) odak ile big tech'ten farklas",
    ],
    WT: [
      "Vertical focus (tek industry) ile savunulabilir pozisyon",
      "Acquisition target olarak konumlan",
    ],
  },
};
```

### SWOT Visualization

```
             INTERNAL
        Strengths    Weaknesses
        ---------    ----------
  O   | SO Strategy | WO Strategy |
  p   | Agresif     | Gelistirme  |    EXTERNAL
  p   | buyume      | ve iyiles.  |
  o   |-------------|-------------|
  r   | ST Strategy | WT Strategy |
  t   | Savunma ve  | Minimize    |
  .   | koruma      | ve kacis    |
        ---------    ----------
        Threats      (combined)
```

## Porter's Five Forces

### Analysis Template

```typescript
interface PortersFiveForces {
  industry: string;
  analysis_date: string;
  forces: {
    competitive_rivalry: ForceAnalysis;
    threat_of_new_entrants: ForceAnalysis;
    threat_of_substitutes: ForceAnalysis;
    bargaining_power_buyers: ForceAnalysis;
    bargaining_power_suppliers: ForceAnalysis;
  };
  overall_attractiveness: "high" | "medium" | "low";
  implications: string[];
}

interface ForceAnalysis {
  intensity: "high" | "medium" | "low";
  score: number;               // 1-5
  drivers: string[];
  mitigations: string[];
}

const portersAnalysis: PortersFiveForces = {
  industry: "Developer Tools SaaS",
  analysis_date: "2026-Q1",
  forces: {
    competitive_rivalry: {
      intensity: "high",
      score: 4,
      drivers: [
        "Cok sayida rakip (50+ developer tool)",
        "Dusuk switching cost",
        "Hizli inovasyon dongusu",
      ],
      mitigations: [
        "Niche odaklanma (AI-first)",
        "Network effects (team adoption)",
        "Data moat (kullanim verisi)",
      ],
    },
    threat_of_new_entrants: {
      intensity: "medium",
      score: 3,
      drivers: [
        "Cloud infra ucuz (AWS/GCP)",
        "Open source alternatifler cok",
        "AI tooling demokratiklesiyor",
      ],
      mitigations: [
        "Brand recognition + community",
        "Entegrasyon ekosistemi (50+ integration)",
        "Data advantage (model egitim verisi)",
      ],
    },
    threat_of_substitutes: {
      intensity: "medium",
      score: 3,
      drivers: [
        "Spreadsheet/email alternatif olabiliyor",
        "In-house tools yapilabiliyor",
        "AI copilot'lar bazi islevleri kapsiyor",
      ],
      mitigations: [
        "Specialized value proposition",
        "Workflow automation (manual isin yerini alan)",
        "Team collaboration (tek kisinin yapamayacagi)",
      ],
    },
    bargaining_power_buyers: {
      intensity: "high",
      score: 4,
      drivers: [
        "Dusuk switching cost",
        "Free tier / open source alternatif bol",
        "Enterprise musteriler cok pazarlik yapar",
      ],
      mitigations: [
        "PLG ile small ticket, cok musteri",
        "Usage-based pricing (deger ile oran)",
        "Lock-in olmadan sticky urun (data, workflow)",
      ],
    },
    bargaining_power_suppliers: {
      intensity: "low",
      score: 2,
      drivers: [
        "Cloud vendor (AWS/GCP) fiyat arttirabiliyor",
        "AI API provider (OpenAI) fiyat politikasi",
      ],
      mitigations: [
        "Multi-cloud stratejisi",
        "Open source LLM fallback",
        "Kendi infra opsiyonu",
      ],
    },
  },
  overall_attractiveness: "medium",
  implications: [
    "Differentiation stratejisi sart (cost leadership yapilamaz)",
    "Community moat en guclu savunma",
    "AI capability hizla evolve ediyor, R&D yatirimi kritik",
  ],
};
```

## Market Positioning

### Positioning Statement Template

```
FOR [target customer]
WHO [statement of need / opportunity]
[Product name] IS A [product category]
THAT [key benefit / compelling reason to buy]
UNLIKE [primary competitive alternative]
OUR PRODUCT [primary differentiation]
```

### Positioning Canvas

```typescript
interface PositioningCanvas {
  target_customer: {
    who: string;
    pain_points: string[];
    desired_outcomes: string[];
  };
  market_category: string;
  competitive_alternatives: string[];
  unique_value: {
    features: string[];                // ne var?
    benefits: string[];                // ne saglar?
    proof_points: string[];            // kanit?
  };
  positioning_statement: string;
  tagline: string;
  key_messages: string[];              // max 3
}

const positioning: PositioningCanvas = {
  target_customer: {
    who: "10-200 kisilik engineering takimlari",
    pain_points: [
      "Tool fatigue (cok fazla arac)",
      "Context switching kaybi",
      "Manual tekrarlayan isler",
    ],
    desired_outcomes: [
      "Tek platformda tum gelistirme akisi",
      "AI ile otomasyon",
      "Olculebilir developer productivity",
    ],
  },
  market_category: "AI-powered developer productivity platform",
  competitive_alternatives: ["Jira + GitHub + Slack + manual isler"],
  unique_value: {
    features: ["AI workflow automation", "Unified dev platform", "Built-in analytics"],
    benefits: ["2x developer velocity", "Zero context switching", "Data-driven decisions"],
    proof_points: ["500+ teams", "4.8 G2 rating", "SOC2 certified"],
  },
  positioning_statement:
    "For engineering teams that waste time on tool sprawl and manual processes, " +
    "DevFlow is an AI-powered developer platform that unifies your entire workflow, " +
    "unlike Jira+GitHub+Slack combinations, our product eliminates context switching " +
    "and automates repetitive tasks with AI.",
  tagline: "Ship faster. Think less about tools.",
  key_messages: [
    "All-in-one: planning, coding, reviewing, deploying",
    "AI automation: repetitive tasks handled automatically",
    "Built for modern teams: fast, opinionated, delightful",
  ],
};
```

## Pricing Analysis

### Competitive Pricing Matrix

```typescript
interface PricingComparison {
  competitor: string;
  model: "per_seat" | "usage_based" | "flat" | "hybrid";
  free_tier: boolean;
  plans: Array<{
    name: string;
    price_monthly: number;
    price_annual_monthly: number;      // yillik plan aylik fiyati
    key_limits: Record<string, string>;
  }>;
  hidden_costs: string[];
  discount_available: string[];
}

const pricingLandscape: PricingComparison[] = [
  {
    competitor: "Competitor A",
    model: "per_seat",
    free_tier: true,
    plans: [
      {
        name: "Free",
        price_monthly: 0,
        price_annual_monthly: 0,
        key_limits: { members: "10", projects: "3", storage: "500MB" },
      },
      {
        name: "Pro",
        price_monthly: 12,
        price_annual_monthly: 10,
        key_limits: { members: "unlimited", projects: "unlimited", storage: "10GB" },
      },
      {
        name: "Enterprise",
        price_monthly: 0, // custom
        price_annual_monthly: 0,
        key_limits: { members: "unlimited", projects: "unlimited", storage: "unlimited" },
      },
    ],
    hidden_costs: ["SSO sadece Enterprise", "API rate limit Pro'da dusuk"],
    discount_available: ["Annual %20", "Startup %50 (1 yil)", "Education free"],
  },
];
```

### Pricing Strategy Decision

| Strateji | Ne Zaman | Risk |
|----------|----------|------|
| Penetration (dusuk fiyat) | Yeni market, paylasmak onemli | Margin dusuk, fiyat artirmak zor |
| Skimming (yuksek fiyat) | Unique value, az rakip | Rakip gelince fiyat dusmek zorunda |
| Value-based | Guclu ROI kaniti var | ROI'yi kanitlamak zor olabilir |
| Competitive | Commodity market | Fiyat savasi riski |
| Freemium | PLG, viral potential | Free kullanicilar convert olmayabilir |

## Technology Stack Comparison

### Tech Stack Intelligence

```typescript
interface TechStackIntel {
  competitor: string;
  source: "job_postings" | "builtwith" | "stackshare" | "github" | "blog";
  frontend: string[];
  backend: string[];
  infrastructure: string[];
  data: string[];
  ai_ml: string[];
  confidence: "high" | "medium" | "low";
}

// Job posting'lerden tech stack cikar
const techIntel: TechStackIntel = {
  competitor: "Competitor A",
  source: "job_postings",
  frontend: ["React", "TypeScript", "Next.js", "Tailwind"],
  backend: ["Node.js", "Go (microservices)", "GraphQL"],
  infrastructure: ["AWS", "Kubernetes", "Terraform", "Datadog"],
  data: ["PostgreSQL", "Redis", "Elasticsearch", "ClickHouse"],
  ai_ml: ["Python", "PyTorch", "OpenAI API"],
  confidence: "medium",
};
```

## User Review Analysis

### Review Mining Template

```typescript
interface ReviewAnalysis {
  competitor: string;
  platform: "G2" | "Capterra" | "TrustRadius" | "ProductHunt" | "AppStore";
  total_reviews: number;
  avg_rating: number;
  sentiment_distribution: {
    positive: number;           // %
    neutral: number;
    negative: number;
  };
  top_praised: Array<{ theme: string; frequency: number; example_quote: string }>;
  top_complaints: Array<{ theme: string; frequency: number; example_quote: string }>;
  switching_reasons: string[];  // neden bize gecsinler
  churn_reasons: string[];      // neden terk ediyorlar
}

const reviewAnalysis: ReviewAnalysis = {
  competitor: "Competitor A",
  platform: "G2",
  total_reviews: 450,
  avg_rating: 4.2,
  sentiment_distribution: { positive: 65, neutral: 20, negative: 15 },
  top_praised: [
    { theme: "Ease of use", frequency: 120, example_quote: "So intuitive, team adopted in a day" },
    { theme: "Customer support", frequency: 85, example_quote: "Fast and helpful support team" },
  ],
  top_complaints: [
    { theme: "Performance on large projects", frequency: 45, example_quote: "Slows down with 1000+ items" },
    { theme: "Missing API features", frequency: 38, example_quote: "API is too limited for our automation needs" },
  ],
  switching_reasons: ["Performance at scale", "Better API", "AI features"],
  churn_reasons: ["Pricing increase", "Missing enterprise features"],
};
```

## Competitive Moat Identification

### Moat Types

| Moat Tipi | Tanim | Ornek | Guc |
|-----------|-------|-------|-----|
| Network Effects | Daha fazla kullanici = daha degerli | Slack, LinkedIn | Cok guclu |
| Data Moat | Veri avantaji | Google, Waze | Guclu |
| Switching Cost | Gecis maliyeti yuksek | Salesforce, SAP | Guclu |
| Brand | Marka taninirligi | Apple, Stripe | Orta-guclu |
| Ecosystem | Entegrasyon/eklenti ekosistemi | Shopify, Figma | Guclu |
| Scale Economies | Olcek avantaji | AWS, Cloudflare | Guclu |
| IP/Patents | Fikri mulkiyet | Qualcomm | Orta |
| Community | Gelistirici/kullanici toplulugu | Redis, Docker | Orta-guclu |
| Regulatory | Regolasyon avantaji | Banking, Healthcare | Cok guclu |

### Moat Assessment

```typescript
interface MoatAssessment {
  company: string;
  moats: Array<{
    type: string;
    current_strength: number;       // 1-10
    trend: "growing" | "stable" | "declining";
    evidence: string[];
    time_to_build: string;          // rakip icin
    defensibility: "high" | "medium" | "low";
  }>;
  overall_moat_score: number;       // 1-10
  vulnerability: string[];
}

const moatAssessment: MoatAssessment = {
  company: "Our Product",
  moats: [
    {
      type: "Community",
      current_strength: 7,
      trend: "growing",
      evidence: [
        "10K GitHub stars",
        "5K Discord members",
        "200+ contributors",
      ],
      time_to_build: "2-3 yil",
      defensibility: "medium",
    },
    {
      type: "Data Moat",
      current_strength: 5,
      trend: "growing",
      evidence: [
        "500K+ workflow execution verisi",
        "AI modelleri bu veri ile egitiliyor",
      ],
      time_to_build: "1-2 yil",
      defensibility: "high",
    },
  ],
  overall_moat_score: 6,
  vulnerability: [
    "Open source fork riski",
    "Big tech ayni ozellikleri ekleyebilir",
    "Community baska platforma gecebilir",
  ],
};
```

## Benchmark Reporting Template

### Monthly Competitive Report

```typescript
interface CompetitiveReport {
  period: string;
  summary: string;                     // 2-3 cumle executive summary
  market_changes: MarketChange[];
  competitor_moves: CompetitorMove[];
  our_position_changes: PositionChange[];
  recommendations: Recommendation[];
}

interface CompetitorMove {
  competitor: string;
  date: string;
  type: "feature_launch" | "pricing_change" | "funding" | "acquisition" | "partnership" | "hire" | "incident";
  description: string;
  impact_on_us: "high" | "medium" | "low" | "none";
  response_needed: boolean;
  suggested_response?: string;
}

interface Recommendation {
  priority: "critical" | "high" | "medium" | "low";
  area: string;
  action: string;
  rationale: string;
  effort: "small" | "medium" | "large";
  expected_impact: string;
}
```

### Win/Loss Analysis

```typescript
interface WinLossData {
  period: string;
  total_opportunities: number;
  wins: number;
  losses: number;
  win_rate: number;
  loss_reasons: Array<{
    reason: string;
    count: number;
    percentage: number;
    lost_to: string[];         // hangi rakibe kaybettik
  }>;
  win_reasons: Array<{
    reason: string;
    count: number;
    percentage: number;
    won_against: string[];     // hangi rakibi yendik
  }>;
  avg_deal_size: { won: number; lost: number };
  avg_sales_cycle_days: { won: number; lost: number };
}

// Win/Loss query
// SELECT
//   outcome,
//   primary_reason,
//   COUNT(*) AS count,
//   ROUND(AVG(deal_value), 0) AS avg_deal,
//   ROUND(AVG(EXTRACT(DAY FROM closed_at - created_at)), 0) AS avg_cycle_days
// FROM opportunities
// WHERE closed_at >= CURRENT_DATE - INTERVAL '90 days'
// GROUP BY outcome, primary_reason
// ORDER BY count DESC;
```

## Anti-Patterns

| Anti-Pattern | Dogru Yol |
|-------------|-----------|
| Rakibi kopyalamak | Kendi gucunu kullan, differentiate et |
| Sadece feature karsilastirmasi | Deger + deneyim + ekosistem dahil et |
| SWOT'u bir kere yapip birakmak | Ceyreklik guncelle |
| Tum rakiplere odaklanmak | Top 3-5 rakibe odaklan |
| Sadece public bilgi kullanmak | Win/loss analizi + musteri gorusmesi ekle |
| Competitor obsesyonu | Musteri problemine odaklan |
| Pricing'i rakibe gore belirlemek | Deger bazli fiyatla, rakibi referans al |
| Moat'u ignore etmek | Her ceyrek moat assessment yap |

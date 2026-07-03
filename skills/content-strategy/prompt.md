---
name: content-strategy
description: Content marketing strategy - content audit, editorial calendar, SEO optimization, content funnel (TOFU/MOFU/BOFU), performance metrics, developer content, social media planning
---

# Content Strategy

## Content Audit Framework

### Audit Spreadsheet Template

| URL | Title | Type | Funnel Stage | Traffic (30d) | Engagement | Conversion | Last Updated | Quality | Action |
|-----|-------|------|-------------|---------------|------------|------------|-------------|---------|--------|
| /blog/x | [title] | Blog | TOFU | [visits] | [time/bounce] | [leads] | [date] | [1-5] | Keep/Update/Remove |

### Audit Process

1. **Inventory:** Export all content URLs and metadata
2. **Metrics:** Pull analytics for each piece (traffic, engagement, conversion)
3. **Quality Score:** Rate 1-5 on accuracy, relevance, depth, UX
4. **Action Decision:**

| Quality | Traffic | Action |
|---------|---------|--------|
| High | High | Keep, optimize keywords |
| High | Low | Promote, update distribution |
| Low | High | Update content quality |
| Low | Low | Remove or consolidate |

5. **Gap Analysis:** What topics are missing vs. competitor coverage?

### Content Inventory Categorization

| Category | Description | Examples |
|----------|-------------|---------|
| Evergreen | Always relevant | How-to guides, reference docs |
| Timely | Time-sensitive | News, trends, event coverage |
| Pillar | Comprehensive topic hub | Ultimate guide, definitive resource |
| Cluster | Supporting pillar content | Specific sub-topic articles |
| Conversion | Action-oriented | Case studies, comparisons, pricing |
| Community | User-generated / social proof | Testimonials, guest posts |

## Editorial Calendar Planning

### Monthly Calendar Template

```markdown
## [Month] Editorial Calendar

### Theme: [monthly theme tied to business goal]

| Week | Type | Title | Author | Funnel | Channel | Status |
|------|------|-------|--------|--------|---------|--------|
| W1 | Blog | [title] | [author] | TOFU | Blog, Twitter | Draft |
| W1 | Social | [campaign] | [author] | TOFU | Twitter, LinkedIn | Scheduled |
| W2 | Tutorial | [title] | [author] | MOFU | Blog, YouTube | Outline |
| W2 | Newsletter | [subject] | [author] | MOFU | Email | Draft |
| W3 | Case Study | [title] | [author] | BOFU | Blog, Sales | Research |
| W3 | Social | [campaign] | [author] | TOFU | All | Planned |
| W4 | Docs Update | [section] | [author] | MOFU | Docs site | Planned |
| W4 | Webinar | [topic] | [speaker] | BOFU | Zoom, YouTube | Planned |
```

### Content Cadence

| Content Type | Frequency | Time to Create | Distribution |
|-------------|-----------|---------------|-------------|
| Blog post | 2-4/month | 3-5 days | Blog, social, newsletter |
| Tutorial | 1-2/month | 5-7 days | Blog, YouTube, docs |
| Case study | 1/month | 2-3 weeks | Blog, sales, email |
| Newsletter | Weekly/biweekly | 1 day | Email |
| Social post | Daily | 30 min | Platform-specific |
| Video/webinar | 1-2/month | 1-2 weeks | YouTube, social |
| Documentation | Continuous | Varies | Docs site |
| Whitepaper/ebook | Quarterly | 3-4 weeks | Gated landing page |

## SEO Content Optimization

### On-Page SEO Checklist

- [ ] Target keyword in title (H1) - front-loaded
- [ ] Target keyword in URL slug
- [ ] Target keyword in first 100 words
- [ ] Meta description (150-160 chars) with keyword and CTA
- [ ] H2/H3 subheadings with related keywords
- [ ] Internal links to related content (3-5)
- [ ] External links to authoritative sources (2-3)
- [ ] Image alt text with descriptive keywords
- [ ] Schema markup (article, FAQ, how-to)
- [ ] Reading time estimate
- [ ] Table of contents for long-form (1500+ words)

### Keyword Research Template

```markdown
## Keyword: [primary keyword]

| Metric | Value |
|--------|-------|
| Monthly search volume | [volume] |
| Keyword difficulty | [1-100] |
| CPC | [$X.XX] |
| Search intent | [informational / transactional / navigational] |
| Current ranking | [position or N/A] |

### Related Keywords
| Keyword | Volume | Difficulty | Priority |
|---------|--------|-----------|----------|
| [related 1] | [vol] | [diff] | [H/M/L] |
| [related 2] | [vol] | [diff] | [H/M/L] |
| [related 3] | [vol] | [diff] | [H/M/L] |

### SERP Analysis
- Position 1: [competitor URL] - [content type, word count]
- Position 2: [competitor URL] - [content type, word count]
- Position 3: [competitor URL] - [content type, word count]

### Content Strategy
- Content type: [blog / guide / comparison / tool]
- Word count target: [based on SERP analysis]
- Unique angle: [what makes ours different]
```

### Content Structure for SEO

```markdown
# [Primary Keyword] - [Benefit/Hook] (H1)

[Introduction: Hook + problem statement + what they'll learn]
[Target keyword in first 100 words]

## Table of Contents

## [H2: Related keyword question/topic]
[Content section - 200-400 words]
[Include data, examples, visuals]

## [H2: Next related topic]
[Content section]

## [H2: Practical/actionable section]
[Code examples, templates, step-by-step]

## FAQ
### [Common question 1?]
[Concise answer - good for featured snippets]

### [Common question 2?]
[Concise answer]

## Conclusion
[Summary + CTA]
```

## Content Funnel (TOFU / MOFU / BOFU)

### Funnel Strategy

```
                    TOFU (Awareness)
                   /                \
         Blog posts              Social content
         SEO content             Video tutorials
         Infographics            Podcasts
                  \              /
                   MOFU (Consideration)
                  /                \
         Case studies            Webinars
         Comparison guides       Email nurture
         Technical docs          Free tools
         Whitepapers             Workshops
                  \              /
                   BOFU (Decision)
                  /                \
         Free trial              Demo request
         ROI calculator          Pricing page
         Implementation guide    Customer stories
         Onboarding content      Sales enablement
```

### Content Types by Funnel Stage

| Stage | Goal | Content Types | CTA |
|-------|------|-------------|-----|
| **TOFU** | Attract, educate | Blog, social, video, podcast, infographic | Subscribe, follow, share |
| **MOFU** | Engage, nurture | Case study, webinar, whitepaper, comparison | Download, register, try |
| **BOFU** | Convert, close | Demo, trial, pricing, implementation guide | Buy, start, schedule |

### Funnel Content Mapping

```markdown
## Feature: [Feature/Product Name]

### TOFU Content
- Blog: "What is [concept]? A Beginner's Guide"
- Blog: "Top 10 [category] Tools in [year]"
- Video: "[concept] Explained in 5 Minutes"
- Social: "[stat] of [audience] struggle with [problem]"

### MOFU Content
- Guide: "How to Choose the Right [category] Tool"
- Case Study: "How [company] Solved [problem] with [product]"
- Webinar: "Best Practices for [topic]"
- Comparison: "[product] vs [competitor]: Honest Comparison"

### BOFU Content
- Demo: "See [product] in Action"
- Calculator: "[metric] ROI Calculator"
- Guide: "Getting Started with [product]"
- Testimonial: "[customer] Increased [metric] by [X]%"
```

## Content Performance Metrics

### Metrics by Goal

| Goal | Metrics | Tools |
|------|---------|-------|
| **Awareness** | Unique visitors, page views, social reach, impressions | GA4, social analytics |
| **Engagement** | Time on page, scroll depth, bounce rate, comments, shares | GA4, Hotjar |
| **Lead Gen** | Form submissions, email signups, content downloads | HubSpot, Mailchimp |
| **Conversion** | Trial signups, demo requests, purchases | CRM, product analytics |
| **Retention** | Return visitors, email open rate, community activity | GA4, email platform |

### Content Scorecard

```markdown
## Monthly Content Scorecard

### Traffic
| Metric | Last Month | This Month | Change |
|--------|-----------|-----------|--------|
| Total visits | [X] | [Y] | [+/-Z%] |
| Organic traffic | [X] | [Y] | [+/-Z%] |
| New visitors | [X] | [Y] | [+/-Z%] |

### Engagement
| Metric | Last Month | This Month | Target |
|--------|-----------|-----------|--------|
| Avg time on page | [X] | [Y] | > 3 min |
| Bounce rate | [X%] | [Y%] | < 55% |
| Pages per session | [X] | [Y] | > 2 |

### Conversion
| Metric | Last Month | This Month | Target |
|--------|-----------|-----------|--------|
| Email signups | [X] | [Y] | [target] |
| Content downloads | [X] | [Y] | [target] |
| Trial signups | [X] | [Y] | [target] |

### Top Performers
| Content | Views | Conversions | Conv Rate |
|---------|-------|------------|----------|
| [title 1] | [X] | [Y] | [Z%] |
| [title 2] | [X] | [Y] | [Z%] |
```

## Content Repurposing Strategies

### Repurposing Matrix

```
Blog Post (pillar)
├── Twitter/X thread (key takeaways)
├── LinkedIn post (professional angle)
├── Instagram carousel (visual summary)
├── YouTube video (talking head + slides)
├── Podcast episode (interview format)
├── Newsletter section (curated excerpt)
├── Slide deck (conference talk)
├── Infographic (data visualization)
├── Reddit/HN post (community discussion)
└── Documentation section (if technical)
```

### Repurposing Checklist

| Source | Target | Adaptation |
|--------|--------|-----------|
| Long blog | Twitter thread | 8-12 key points, add visuals |
| Blog | LinkedIn | Professional tone, add personal take |
| Blog | Newsletter | Summary + personal insight + CTA |
| Webinar | Blog | Transcript + structure + screenshots |
| Case study | Social proof | Pull quotes + metrics |
| FAQ section | YouTube shorts | 60-sec answers |
| Documentation | Tutorial blog | Step-by-step with context |

## Developer-Focused Content Patterns

### Technical Blog Post Template

```markdown
# [Action Verb] [Technology] with [Tool/Method]

**TL;DR:** [1-2 sentence summary of what they'll learn/build]

## Prerequisites
- [requirement 1]
- [requirement 2]

## The Problem
[What problem does this solve? Why should they care?]

## Solution
[High-level approach]

### Step 1: [First step]
```[language]
// Code example with comments
```

### Step 2: [Second step]
```[language]
// Code example
```

## How It Works
[Explain the "why" behind the code]

## Common Pitfalls
- [Pitfall 1]: [How to avoid]
- [Pitfall 2]: [How to avoid]

## Next Steps
- [Further reading]
- [Related project]
- [Community link]
```

### Developer Content Types

| Type | Length | Audience | Goal |
|------|--------|----------|------|
| Quick tip | 300-500 words | All devs | Quick wins, shareability |
| Tutorial | 1000-2000 words | Beginners | Teach specific skill |
| Deep dive | 2000-4000 words | Intermediate+ | Thorough understanding |
| Architecture post | 1500-3000 words | Senior devs | Design decisions |
| Changelog/release notes | 200-500 words | Users | Inform about updates |
| Comparison guide | 1500-2500 words | Evaluators | Help decision-making |
| Open source contribution guide | 500-1000 words | Contributors | Onboard contributors |

## Social Media Content Planning

### Platform Strategy

| Platform | Audience | Tone | Content Type | Frequency |
|----------|----------|------|-------------|-----------|
| Twitter/X | Devs, tech | Conversational, witty | Tips, threads, memes | 1-3/day |
| LinkedIn | B2B, leadership | Professional, insightful | Articles, achievements | 3-5/week |
| YouTube | Learners | Educational, clear | Tutorials, demos | 1-2/week |
| Reddit | Community | Authentic, helpful | Discussions, AMAs | 2-3/week |
| HN | Builders | Technical, direct | Launches, deep dives | Strategic |
| Dev.to | Developers | Technical, friendly | Tutorials, experiences | 1-2/week |

### Social Post Templates

```markdown
## Twitter/X Thread Template
1/ [Hook - surprising stat or bold claim]

2/ [Context - why this matters]

3/ [Point 1 - with example]

4/ [Point 2 - with example]

5/ [Point 3 - with example]

6/ [Practical takeaway]

7/ [CTA - link, follow, retweet]

## LinkedIn Post Template
[Opening hook - first 2 lines visible before "see more"]

[Personal story or observation]

[3-5 key insights with line breaks]

[Actionable takeaway]

[Question to drive engagement]

#[relevant] #[hashtags] #[3-5max]
```

## Anti-Patterns

| Anti-Pattern | Neden Yanlis | Dogru Yol |
|-------------|-------------|-----------|
| Content without strategy | Wasted effort | Tie every piece to a funnel stage + goal |
| Publish and forget | Decay over time | Schedule updates, track performance |
| Keyword stuffing | Penalized by search engines | Natural language, semantic keywords |
| Only TOFU content | No conversion path | Balance funnel stages |
| Ignoring distribution | "Build it and they will come" fallacy | 20% creation, 80% distribution |
| No repurposing | Inefficient | Every piece should become 3-5 formats |
| Copying competitors | No differentiation | Unique angle, proprietary data, hot takes |
| All text, no visuals | Low engagement | Add diagrams, screenshots, videos |
| No CTA | Missed conversions | Every piece needs a next step |
| Inconsistent publishing | Audience loses trust | Sustainable cadence > burst publishing |

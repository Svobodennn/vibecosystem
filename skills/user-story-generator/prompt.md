---
name: user-story-generator
description: User story generation - INVEST criteria, acceptance criteria (BDD/Given-When-Then), story mapping, epic decomposition, edge case stories, NFR stories
---

# User Story Generator

## User Story Format

### Standard Format

```
As a [role/persona],
I want [goal/feature],
so that [benefit/value].
```

### Extended Format (with context)

```
As a [role/persona],
In the context of [situation/scenario],
I want [goal/feature],
so that [benefit/value].
```

### Examples

```
As a new user,
I want to sign up with my email and password,
so that I can create an account and start using the service.

As a team admin,
In the context of onboarding a new team member,
I want to invite users via email,
so that they can join the workspace without manual account creation.

As an API consumer,
I want to authenticate with an API key,
so that I can securely access resources programmatically.
```

## INVEST Criteria

### Checklist

| Criteria | Question | Example (Iyi) | Example (Kotu) |
|----------|----------|---------------|----------------|
| **I**ndependent | Can it be developed without other stories? | "User can reset password" | "User can reset password (requires email service story)" |
| **N**egotiable | Is implementation flexible? | "User can search products" | "User searches with Elasticsearch 8.x using fuzzy match" |
| **V**aluable | Does it deliver user/business value? | "User can export data as CSV" | "Refactor database schema" |
| **E**stimable | Can the team estimate it? | "User can upload a profile photo" | "Improve system performance" |
| **S**mall | Can it be done in one sprint? | "User can add item to cart" | "User can complete entire checkout flow" |
| **T**estable | Can we verify it's done? | "Login with wrong password shows error message" | "System should be user-friendly" |

### INVEST Validation

```markdown
## Story: [story title]

### INVEST Check
- [ ] **Independent:** No hard dependency on other stories
- [ ] **Negotiable:** Multiple implementation approaches possible
- [ ] **Valuable:** Clear end-user or business value
- [ ] **Estimable:** Team can estimate within 1 story point range
- [ ] **Small:** Fits within a single sprint
- [ ] **Testable:** Clear pass/fail acceptance criteria
```

## Acceptance Criteria (Given-When-Then / BDD)

### Format

```gherkin
Scenario: [descriptive scenario name]
  Given [precondition / initial state]
  And [additional precondition if needed]
  When [action / trigger]
  And [additional action if needed]
  Then [expected result / assertion]
  And [additional assertion if needed]
  But [exception / negative assertion if needed]
```

### Complete Example

```gherkin
Feature: Shopping Cart

  Scenario: Add item to empty cart
    Given the user is logged in
    And the cart is empty
    When the user clicks "Add to Cart" on a product
    Then the cart should contain 1 item
    And the cart badge should show "1"
    And the cart total should equal the product price

  Scenario: Add same item twice
    Given the user has 1 unit of "Widget A" in the cart
    When the user clicks "Add to Cart" on "Widget A" again
    Then the cart should show 2 units of "Widget A"
    And the cart total should be 2x the unit price
    But a duplicate line item should NOT be created

  Scenario: Add item when not logged in
    Given the user is not logged in
    When the user clicks "Add to Cart"
    Then the item should be saved to a guest cart (cookie-based)
    And the user should NOT be redirected to login
    And the guest cart should merge on login

  Scenario: Add out-of-stock item
    Given the product "Widget B" has 0 stock
    When the user views "Widget B"
    Then the "Add to Cart" button should be disabled
    And a "Notify me" option should be shown
```

### Acceptance Criteria Anti-Patterns

| Anti-Pattern | Neden Yanlis | Dogru Yol |
|-------------|-------------|-----------|
| "Should work properly" | Tanimsiz | Specify exact expected behavior |
| Implementation details | Cozumu kisitlar | "Data persists" not "saves to PostgreSQL" |
| Missing error cases | Incomplete spec | Add scenarios for every failure mode |
| Too many scenarios (10+) | Story too big | Split the story |
| No performance criteria | NFR eksik | Add "within 2 seconds" where needed |
| Duplicate of another story | Redundancy | Reference, don't repeat |

## Story Mapping

### Story Map Structure

```
               User Journey (left to right)
               ─────────────────────────────────────
Activities:    | Discovery  | Purchase   | Support  |
               ─────────────────────────────────────
User Tasks:    | Search     | Add to     | Contact  |
               | Browse     | Cart       | Support  |
               | Compare    | Checkout   | Return   |
               |            | Pay        | Review   |
               ─────────────────────────────────────
Release 1:     | Basic      | Cart +     | Email    |
(MVP)          | search     | Checkout   | form     |
               ─────────────────────────────────────
Release 2:     | Filters    | Saved      | Live     |
               | Sort       | cards      | chat     |
               | Compare    | Wishlist   | FAQ      |
               ─────────────────────────────────────
Release 3:     | AI search  | Subscr.    | Chatbot  |
               | Reco's     | Gift cards | Ticket   |
```

### Story Map Template

```markdown
## Story Map: [Product/Feature Name]

### Backbone (Activities - user's high-level goals)
1. [Activity 1]: [description]
2. [Activity 2]: [description]
3. [Activity 3]: [description]

### Walking Skeleton (minimum viable flow)
| Activity | Minimum Story | Priority |
|----------|--------------|----------|
| [Act 1] | [simplest version] | Must |
| [Act 2] | [simplest version] | Must |
| [Act 3] | [simplest version] | Must |

### Release Slices
| Release | Scope | Theme |
|---------|-------|-------|
| R1 (MVP) | Walking skeleton | "It works" |
| R2 | Enhanced UX | "It's pleasant" |
| R3 | Advanced features | "It's powerful" |
```

## Epic Decomposition

### Epic to Stories Workflow

```
EPIC: User Authentication System
├── STORY: Email/password registration
├── STORY: Email verification
├── STORY: Login with email/password
├── STORY: Password reset via email
├── STORY: Social login (Google)
├── STORY: Social login (GitHub)
├── STORY: MFA setup (TOTP)
├── STORY: MFA verification on login
├── STORY: Session management (logout, expire)
└── STORY: Account deletion
```

### Decomposition Strategies

| Strategy | When to Use | Example |
|----------|-------------|---------|
| **By workflow step** | Sequential processes | Checkout: cart -> address -> payment -> confirmation |
| **By data variation** | Multiple input types | Import: CSV upload, API sync, manual entry |
| **By user role** | Multi-role features | Dashboard: admin view, manager view, user view |
| **By CRUD operation** | Data management | Products: create, read, update, delete |
| **By business rule** | Complex logic | Pricing: base price, discounts, tax, shipping |
| **By platform** | Multi-platform | Notifications: email, push, SMS, in-app |
| **By performance** | Optimization layers | Search: basic search, filters, autocomplete, facets |

### Decomposition Template

```markdown
## Epic: [Epic Name]

**Business Value:** [neden onemli]
**Target Persona:** [kim icin]
**Size Estimate:** [S/M/L/XL]

### Stories

| # | Story | Priority | Size | Sprint |
|---|-------|----------|------|--------|
| 1 | As a [role], I want [X], so that [Y] | Must | S | 1 |
| 2 | As a [role], I want [X], so that [Y] | Must | M | 1 |
| 3 | As a [role], I want [X], so that [Y] | Should | S | 2 |
| 4 | As a [role], I want [X], so that [Y] | Could | M | 3 |

### Dependencies
- Story 2 depends on Story 1
- Story 4 can be done in parallel with Story 3

### Definition of Done (Epic Level)
- [ ] All Must stories completed
- [ ] Integration tests passing
- [ ] Documentation updated
- [ ] Stakeholder demo completed
```

### Decomposition Anti-Patterns

| Anti-Pattern | Neden Yanlis | Dogru Yol |
|-------------|-------------|-----------|
| Technical decomposition | "Create DB schema" has no user value | Split by user-facing behavior |
| Too small (< 1 hour) | Overhead > value | Combine related micro-tasks |
| Too large (> 1 sprint) | Unestimable, risky | Decompose further |
| Horizontal slicing | "Build all APIs, then all UI" | Vertical slice (API + UI for one feature) |

## Edge Case Stories

### Common Edge Cases

```markdown
## Edge Case Stories for [Feature]

### Empty State
As a new user,
When I have no [items/data/history],
I want to see a helpful empty state with a clear CTA,
so that I know how to get started.

### Error Recovery
As a user,
When an operation fails (network error, timeout, server error),
I want to see a clear error message with a retry option,
so that I can recover without losing my work.

### Boundary Values
As a user,
When I enter the maximum allowed value (e.g., 10,000 characters in a text field),
I want to see a character counter and graceful truncation,
so that I know my limits before submitting.

### Concurrent Access
As a user,
When another user edits the same resource simultaneously,
I want to be notified of the conflict,
so that I don't accidentally overwrite their changes.

### Offline / Slow Connection
As a mobile user,
When I lose network connectivity,
I want my pending actions to be queued and synced when back online,
so that I don't lose my work.

### Permission Denied
As a user without admin privileges,
When I try to access an admin-only feature,
I want to see a clear message explaining why access is denied,
so that I can request access if needed.

### Data Migration
As an existing user,
When the system migrates to a new version,
I want my existing data to be preserved and correctly mapped,
so that I don't lose any information.
```

### Edge Case Discovery Checklist

- [ ] What if the input is empty?
- [ ] What if the input is at maximum length?
- [ ] What if the input contains special characters / unicode?
- [ ] What if the user double-clicks / double-submits?
- [ ] What if the network fails mid-operation?
- [ ] What if the user has no permission?
- [ ] What if the data doesn't exist (404)?
- [ ] What if there are concurrent modifications?
- [ ] What if the browser is resized / mobile view?
- [ ] What if the user navigates away mid-process?
- [ ] What if the session expires during an action?
- [ ] What if the third-party service is down?

## Non-Functional Requirement Stories

### Performance

```
As a user,
I want the dashboard to load within 2 seconds,
so that I can quickly access my data without frustration.

Acceptance Criteria:
- Given normal network conditions (4G+)
- When the user navigates to the dashboard
- Then the page is fully interactive within 2 seconds
- And the Largest Contentful Paint (LCP) is < 2.5s
- And the First Input Delay (FID) is < 100ms
```

### Security

```
As a security-conscious user,
I want my session to expire after 30 minutes of inactivity,
so that my account is protected if I forget to log out.

Acceptance Criteria:
- Given the user has been inactive for 30 minutes
- When the user tries to perform an action
- Then the user is redirected to the login page
- And a "Session expired" message is shown
- And no sensitive data remains in the browser
```

### Accessibility

```
As a user with visual impairment,
I want all form fields to have proper labels and error announcements,
so that I can use the application with a screen reader.

Acceptance Criteria:
- Given all form fields have associated labels (aria-label or <label>)
- When a validation error occurs
- Then the error is announced by the screen reader (aria-live)
- And focus moves to the first invalid field
- And color is not the only indicator of error state
```

### Scalability

```
As a system,
I need to handle 10,000 concurrent users without degradation,
so that the service remains reliable during peak usage.

Acceptance Criteria:
- Given 10,000 concurrent users
- When performing standard operations
- Then response time remains < 500ms (p95)
- And error rate stays < 0.1%
- And CPU usage stays < 80%
```

### Reliability

```
As a user,
I want my data changes to be saved even if the server crashes,
so that I never lose my work.

Acceptance Criteria:
- Given the user submits a form
- When the server acknowledges the request
- Then the data is persisted to durable storage
- And a power failure does not result in data loss
- And transactions are ACID-compliant
```

## Story Quality Checklist

### Before Sprint Planning

- [ ] Story follows "As a... I want... so that..." format
- [ ] INVEST criteria all met
- [ ] Acceptance criteria written in Given-When-Then
- [ ] Happy path + at least 2 error scenarios covered
- [ ] Size is estimable (team agrees on story points)
- [ ] No technical jargon (understandable by non-devs)
- [ ] Dependencies identified and resolved
- [ ] Design/wireframe attached if UI story
- [ ] Edge cases identified
- [ ] NFR implications noted

### Common Story Smells

| Smell | Symptom | Fix |
|-------|---------|-----|
| Too vague | "As a user, I want a better experience" | Be specific about what "better" means |
| Too technical | "As a developer, I want to refactor the DB" | Reframe as user value |
| Too large | Team can't estimate confidently | Decompose into smaller stories |
| No value | "Create config file" | Attach to a user-facing story |
| Hidden dependency | "Requires API not built yet" | Make dependency explicit, plan accordingly |
| Gold plating | 15 acceptance criteria | Split into multiple stories |

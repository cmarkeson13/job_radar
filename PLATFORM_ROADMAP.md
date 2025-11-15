# Job Platform Adapter Roadmap

## Overview

This document outlines the priority and approach for adding job platform adapters to Job Radar. Platforms are prioritized by:
1. **Ease of API access** (APIs first, then scraping)
2. **Common usage** (most common platforms first)
3. **Technical complexity** (simpler implementations first)

---

## ✅ Completed

- **Greenhouse** - Full API support via `boards-api.greenhouse.io`
- **Lever** - Full API support via `api.lever.co/v0/postings/{company}`
- **Generic HTML Scraper** - Basic scraping for custom `/careers` pages

## 🔧 In Progress / Needs Work

- **Ashby** - HTML scraping implemented but finding 0 jobs. **FOUND PUBLIC API**: `https://api.ashbyhq.com/posting-api/job-board/{clientname}?includeCompensation=true` - **NEEDS TO SWITCH TO API INSTEAD OF SCRAPING**

---

## 🔥 High Priority (Easy APIs)

### 1. **Lever** ⭐ EASIEST
- **API**: `https://api.lever.co/v0/postings/{company}`
- **Difficulty**: Easy - Simple REST API
- **Notes**: Very straightforward, similar to Greenhouse
- **Status**: Ready to implement

### 2. **Ashby** ⭐ EASY
- **API**: `https://api.ashbyhq.com/posting-api/job-board/{clientname}?includeCompensation=true`
- **Difficulty**: Easy - JSON API
- **Notes**: Public API available, need to use correct endpoint format
- **Status**: Need to update adapter to use API instead of scraping

### 3. **Workable** ⭐ EASY
- **API**: `https://{company}.workable.com/api/v3/jobs`
- **Difficulty**: Easy-Medium - REST API (may require API key)
- **Notes**: Some companies use public API, others require auth
- **Status**: Need to test public vs private access

---

## 🟡 Medium Priority (Moderate Complexity)

### 4. **Polymer** ⭐ NEW
- **API/Structure**: Research needed
- **Difficulty**: Medium - Need to investigate structure
- **Notes**: User-requested platform
- **Status**: Research needed

### 5. **BambooHR**
- **API**: `https://{company}.bamboohr.com/careers/list`
- **Difficulty**: Medium - May need to scrape or use internal API
- **Notes**: Often uses custom implementations, may need HTML parsing
- **Status**: Research needed

### 5. **Antler**
- **API**: Check for public API or JSON endpoints
- **Difficulty**: Medium - May require scraping
- **Notes**: Smaller platform, may need custom approach per company
- **Status**: Research needed

### 6. **YC WorkAtAStartup**
- **API**: `https://www.workatastartup.com/jobs` (may have API)
- **Difficulty**: Medium - Likely needs scraping
- **Notes**: Y Combinator job board, may have structured data
- **Status**: Research needed

---

## 🟢 Lower Priority (Complex/Challenging)

### 7. **Big SaaS Platforms** (Salesforce, Microsoft, etc.)
- **Approach**: Each may have different systems
- **Difficulty**: High - Varies by company
- **Notes**: Large companies often use custom solutions or multiple platforms
- **Status**: Research per company needed

### 8. **LinkedIn Jobs**
- **API**: Limited/restricted access
- **Difficulty**: Very High - LinkedIn has strict API policies
- **Notes**: 
  - Official API is expensive/restricted
  - Scraping violates ToS
  - May need to use LinkedIn's official integrations
- **Status**: Low priority, explore alternatives

### 9. **Other Job Board Platforms**
- Examples: Indeed, ZipRecruiter, Monster, etc.
- **Difficulty**: Varies
- **Notes**: Most are aggregators, not company-specific
- **Status**: Lower priority (focus on company-specific boards first)

---

## 🛠️ Improvements Needed

### **Generic HTML Scraper Enhancement**
- **Current**: Basic pattern matching
- **Improvements Needed**:
  - Better job link detection
  - Support for JSON-LD structured data
  - Support for `<script type="application/json">` job data
  - Better location/remote detection
  - Support for pagination
  - Handle JavaScript-rendered content (may need Puppeteer/Playwright)

---

## Implementation Strategy

### Phase 1: Quick Wins (This Week)
1. ✅ Greenhouse (Done)
2. Lever
3. Ashby
4. Workable (if public API available)

### Phase 2: Enhanced Scraping (Next)
1. Improve Generic HTML scraper
2. Add JSON-LD support
3. Add structured data detection

### Phase 3: Medium Complexity (Later)
1. BambooHR
2. Antler
3. YC WorkAtAStartup

### Phase 4: Complex/Research (Future)
1. Big SaaS platforms (case-by-case)
2. LinkedIn (if viable solution found)
3. Other aggregators

---

## Technical Notes

### API Patterns to Look For:
- REST APIs: `/api/v1/jobs`, `/api/jobs`, `/jobs.json`
- GraphQL: Some modern platforms use GraphQL
- JSON endpoints: `/careers.json`, `/jobs.json`
- RSS feeds: Some companies still use RSS

### Scraping Considerations:
- Rate limiting (be respectful)
- User-Agent headers
- JavaScript rendering (may need headless browser)
- Structured data (JSON-LD, microdata)
- Pagination handling

### Error Handling:
- Network timeouts
- Invalid URLs
- Changed page structures
- Rate limiting
- Authentication requirements

---

## Testing Strategy

For each platform:
1. Test with 2-3 real company examples
2. Verify job data extraction (title, location, URL, etc.)
3. Test error handling (invalid company, network errors)
4. Document any special requirements or limitations

---

## Next Steps

1. **Start with Lever** - Easiest API, similar to Greenhouse
2. **Then Ashby** - Also straightforward API
3. **Improve Generic Scraper** - Better coverage for custom pages
4. **Add Workable** - Test public API access
5. **Continue down the list** as time permits


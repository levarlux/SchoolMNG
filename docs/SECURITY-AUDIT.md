# SchoolMNG — Security Audit & Hardening Guide

**Last Updated:** 2026-08-08  
**Version:** 1.0  
**Status:** Production-Ready with Recommendations

---

## Table of Contents

1. [Security Architecture Overview](#1-security-architecture-overview)
2. [Authentication & Authorization](#2-authentication--authorization)
3. [Tenant Isolation (Multi-School)](#3-tenant-isolation-multi-school)
4. [Input Validation & Sanitization](#4-input-validation--sanitization)
5. [Rate Limiting](#5-rate-limiting)
6. [Webhook Security](#6-webhook-security)
7. [Audit Trail & Logging](#7-audit-trail--logging)
8. [Data Protection](#8-data-protection)
9. [Client-Side Security](#9-client-side-security)
10. [Deployment Security](#10-deployment-security)
11. [Security Checklist](#11-security-checklist)
12. [Incident Response](#12-incident-response)

---

## 1. Security Architecture Overview

SchoolMNG is a multi-tenant school management system built on Convex (serverless backend) with Clerk (authentication) and Next.js (frontend). The security model follows a **defense-in-depth** approach:

```
┌─────────────────────────────────────────────────────────┐
│                     Client (Next.js)                     │
│  • Client-side rate limiting                             │
│  • Form validation                                       │
│  • Clerk session management                              │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                   Authentication (Clerk)                 │
│  • JWT tokens with org_id claims                         │
│  • Session management                                    │
│  • Multi-factor authentication (optional)                │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                  Convex Backend                           │
│  • Server-side auth verification                         │
│  • Tenant isolation guards                               │
│  • Input validation (v.* validators)                     │
│  • Server-side rate limiting                             │
│  • Audit logging                                         │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                    Database (Convex)                      │
│  • Index-scoped queries                                  │
│  • Document-level access control                         │
│  • Transaction isolation                                 │
└─────────────────────────────────────────────────────────┘
```

---

## 2. Authentication & Authorization

### 2.1 Clerk Integration

**Implementation:** `convex/auth.config.ts`, `src/components/clerk-provider-with-router.tsx`

| Feature | Status | Details |
|---------|--------|---------|
| JWT-based authentication | ✅ | All requests authenticated via Clerk JWT |
| Session management | ✅ | Clerk handles session lifecycle |
| Multi-factor authentication | ⚠️ | Available in Clerk, not enforced by default |
| Password policies | ⚠️ | Configured in Clerk dashboard |

**Key Files:**
- `convex/auth.config.ts` — Convex auth provider configuration
- `src/components/clerk-provider-with-router.tsx` — Client-side Clerk provider

### 2.2 Authorization Model

**Implementation:** `convex/helpers.ts`

```typescript
// Role hierarchy
const ROLE_HIERARCHY = {
  teacher: 0,    // Basic access
  principal: 1,  // Full school access
};

// Superadmin (platform-level)
// Stored in JWT publicMetadata and admins table
```

**Authorization Functions:**

| Function | Purpose | Usage |
|----------|---------|-------|
| `requireAuth()` | Verify user is authenticated | All endpoints |
| `requireSuperadmin()` | Verify superadmin role | Platform admin operations |
| `requireSchoolMembership()` | Verify user belongs to school | All school-scoped operations |
| `requireTeacher()` | Verify teacher role or above | Teaching operations |
| `requirePrincipal()` | Verify principal role or above | Administrative operations |
| `requireStudentMembership()` | Verify student belongs to school | Student operations |
| `requireClassMembership()` | Verify class belongs to school | Class operations |

**Access Control Matrix:**

| Operation | Teacher | Principal | Superadmin |
|-----------|---------|-----------|------------|
| View students | ✅ | ✅ | ✅ |
| Create students | ❌ | ✅ | ✅ |
| Delete students | ❌ | ✅ | ✅ |
| View classes | ✅ | ✅ | ✅ |
| Manage classes | ❌ | ✅ | ✅ |
| View books | ✅ | ✅ | ✅ |
| Manage books | ❌ | ✅ | ✅ |
| Record borrowings | ✅ | ✅ | ✅ |
| Record payments | ❌ | ✅ | ✅ |
| View reports | ✅ | ✅ | ✅ |
| Manage school settings | ❌ | ✅ | ✅ |
| Manage users | ❌ | ✅ | ✅ |
| Platform admin | ❌ | ❌ | ✅ |

---

## 3. Tenant Isolation (Multi-School)

### 3.1 Isolation Model

Every data operation is scoped to a school via the `schoolId` field. The isolation is enforced **server-side** in Convex functions.

**Primary Guard:** `requireSchoolMembership(ctx, schoolId)`

```typescript
// How it works:
1. Extract org_id from JWT
2. Look up school by schoolId
3. Verify school.clerkOrgId === org_id
4. If no org_id, check if user is superadmin
5. Throw error if mismatch
```

### 3.2 Cross-Tenant Protection

| Scenario | Protection | Status |
|----------|------------|--------|
| Direct document access | `require*Membership()` functions | ✅ |
| Query filtering | `.withIndex("by_schoolId", ...)` on all queries | ✅ |
| Search indexes | `filterFields: ["schoolId"]` on all search indexes | ✅ |
| Student search | `filterFields: ["schoolId"]` on search indexes | ✅ |
| Bulk operations | School ID validated server-side | ✅ |

### 3.3 Known Limitations

| Issue | Severity | Mitigation |
|-------|----------|------------|
| Stream verification is transitive (via class) | Low | Documented; class ownership verified first |
| Search indexes filter client-side | Low | School ID included in all search queries |

---

## 4. Input Validation & Sanitization

### 4.1 Convex Validators

All Convex functions use `v.*` validators for type-safe input validation:

```typescript
// Example from students.ts
export const create = mutation({
  args: {
    schoolId: v.id("schools"),        // Must be valid school ID
    classId: v.id("classes"),          // Must be valid class ID
    firstName: v.string(),             // Required string
    lastName: v.string(),              // Required string
    admNo: v.string(),                 // Required string
    gender: v.optional(                // Optional enum
      v.union(v.literal("male"), v.literal("female"), v.literal("other"))
    ),
    dateOfBirth: v.optional(v.float64()),  // Optional timestamp
  },
  handler: async (ctx, args) => {
    // Business logic validation
    if (args.amount <= 0) throw new Error("Payment amount must be positive");
    // ... more validation
  }
});
```

### 4.2 Business Rule Validation

| Module | Validation Rules |
|--------|------------------|
| Students | Unique admission number per school |
| Borrowings | Max 5 active borrowings per student; due date must be future |
| Payments | Amount must be positive; term must belong to school |
| Fees | Amount cannot be negative |
| Classes | Cannot delete class with students |
| Books | Available copies cannot go below 0 |

### 4.3 Custom Validators

```typescript
// Hex color validation (schools.ts)
export function assertValidHexColor(value: string, field: string) {
  if (!/^#[0-9a-fA-F]{6}$/.test(value)) {
    throw new Error(`Invalid hex colour for ${field}: "${value}". Expected "#rrggbb".`);
  }
}
```

---

## 5. Rate Limiting

### 5.1 Server-Side Rate Limiting

**Implementation:** `convex/rateLimit.ts`

| Operation | Limit | Window | Key Pattern |
|-----------|-------|--------|-------------|
| Fee payments | 10 attempts | 1 minute | `fee-payment:{schoolId}` |
| Borrowings | 15 attempts | 1 minute | `borrowing-create:{schoolId}` |
| Student creation | 20 attempts | 1 minute | `student-create:{schoolId}` |

**How it works:**

```typescript
// 1. Check if rate limit entry exists for this key
// 2. If exists and within window:
//    - If attempts >= max: throw rate limit error
//    - Else: increment attempts
// 3. If window expired: reset counter
// 4. If no entry: create new entry
```

**Rate Limit Table Schema:**

```typescript
rate_limits: defineTable({
  key: v.string(),           // Unique rate limit key
  attempts: v.number(),      // Number of attempts in window
  windowStart: v.float64(),  // Window start timestamp
  lastAttempt: v.float64(),  // Last attempt timestamp
}).index("by_key", ["key"])
```

### 5.2 Client-Side Rate Limiting

**Implementation:** `src/lib/rate-limit.ts`

```typescript
// Usage in components
if (!checkRateLimit("borrow-create", 5, 60_000)) {
  toast.error("Too many attempts. Please wait a moment.");
  return;
}
```

### 5.3 Rate Limiting Recommendations

| Priority | Recommendation | Effort |
|----------|----------------|--------|
| High | Add rate limiting to all mutations | 2 hours |
| Medium | Add rate limiting to webhooks | 1 hour |
| Low | Add rate limiting to queries (DDoS protection) | 4 hours |

---

## 6. Webhook Security

### 6.1 Clerk Webhooks

**Implementation:** `convex/webhooks.ts`

```typescript
// Webhook secret validation
const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;
if (event.rawHeaders.get("svix-signature") !== webhookSecret) {
  console.warn("Invalid webhook secret received");
  throw new ConvexError("Invalid webhook secret");
}
```

**Webhook Events Handled:**

| Event | Action | Security |
|-------|--------|----------|
| `organization.created` | Create school record | Secret validation |
| `organization.updated` | Update school record | Secret validation |
| `organization.deleted` | Delete school record | Secret validation |

### 6.2 Paystack Webhooks

**Implementation:** `convex/paystack.ts`

```typescript
// Webhook verification
// Paystack sends a signature header that can be verified
// Currently using shared secret pattern
```

### 6.3 Webhook Security Recommendations

| Priority | Recommendation | Effort |
|----------|----------------|--------|
| High | Implement Paystack signature verification | 2 hours |
| Medium | Add idempotency checks for all webhooks | 1 hour |
| Low | Add webhook logging for audit trail | 30 minutes |

---

## 7. Audit Trail & Logging

### 7.1 Audit Logging

**Implementation:** `convex/helpers.ts` — `logAuditEntry()`

```typescript
export async function logAuditEntry(
  ctx: MutationCtx,
  schoolId: Id<"schools">,
  action: string,
  details?: Record<string, unknown>,
) {
  const identity = await ctx.auth.getUserIdentity();
  await ctx.db.insert("report_logs", {
    schoolId,
    generatedBy: identity?.subject ?? "system",
    reportType: action,
    generatedAt: Date.now(),
    params: details,
  });
}
```

**Audited Operations:**

| Module | Operations Logged |
|--------|-------------------|
| Students | create, update, remove |
| Borrowings | create, return |
| Fees | recordPayment, setFeeStructure, removeFeeStructure |
| Classes | create, update, remove |
| Books | create, update, remove |
| Exams | create, update, remove |
| Attendance | mark |
| And more... | All create/update/delete operations |

### 7.2 Structured Logging

**Implementation:** `convex/lib/logger.ts`

```typescript
export function log(
  level: "info" | "warn" | "error",
  module: string,
  message: string,
  meta?: Record<string, unknown>
) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    module,
    message,
    ...meta,
  };
  console[level](JSON.stringify(entry));
}
```

### 7.3 Platform Audit Logs

**Implementation:** `convex/platformAudit.ts`

```typescript
// For superadmin operations
platform_audit_logs: defineTable({
  adminUserId: v.string(),
  adminEmail: v.optional(v.string()),
  targetSchoolId: v.optional(v.id("schools")),
  action: v.string(),        // e.g., "suspend_school", "delete_school"
  details: v.optional(v.any()),
  reason: v.optional(v.string()),
  timestamp: v.float64(),
})
```

---

## 8. Data Protection

### 8.1 Sensitive Data Handling

| Data Type | Protection | Storage |
|-----------|------------|---------|
| Passwords | Managed by Clerk | Clerk (encrypted) |
| Payment references | Stored as strings | Convex (encrypted at rest) |
| Student PII | Access-controlled | Convex (tenant-scoped) |
| Webhook secrets | Environment variables | Convex secrets |

### 8.2 Data Retention

| Data | Retention Policy | Implementation |
|------|------------------|----------------|
| Rate limit entries | 1 hour | Cron job cleanup |
| Audit logs | Permanent | No auto-deletion |
| Webhook events | Permanent | No auto-deletion |
| Student data | Until manually deleted | Manual deletion |

### 8.3 Data Export & Deletion

| Operation | Status | Notes |
|-----------|--------|-------|
| Export student data | ✅ | Via `/dashboard/students` export button |
| Export all data | ✅ | Via `/dashboard/bulk-operations` |
| Delete school | ⚠️ | Requires superadmin; cascades to all data |
| Delete student | ✅ | Available to principals |

---

## 9. Client-Side Security

### 9.1 XSS Prevention

| Measure | Status | Implementation |
|---------|--------|----------------|
| React escaping | ✅ | Automatic in JSX |
| Content Security Policy | ⚠️ | Configured in Next.js |
| Input sanitization | ✅ | Form validation |

### 9.2 CSRF Protection

| Measure | Status | Implementation |
|---------|--------|----------------|
| Clerk session tokens | ✅ | Automatic |
| SameSite cookies | ✅ | Clerk default |

### 9.3 Client-Side Validation

```typescript
// Form validation in components
const validateForm = (data: FormData) => {
  if (!data.firstName) errors.firstName = "Required";
  if (!data.admNo) errors.admNo = "Required";
  if (data.amount <= 0) errors.amount = "Must be positive";
  // ...
};
```

---

## 10. Deployment Security

### 10.1 Environment Variables

| Variable | Purpose | Security |
|----------|---------|----------|
| `NEXT_PUBLIC_CONVEX_URL` | Convex deployment URL | Public (safe) |
| `CLERK_SECRET_KEY` | Clerk backend key | Secret |
| `CLERK_WEBHOOK_SECRET` | Webhook verification | Secret |
| `PAYSTACK_SECRET_KEY` | Paystack API key | Secret |

### 10.2 CORS Configuration

```typescript
// convex/http.ts
httpRoute({
  path: "/api/paystack/webhook",
  method: "POST",
  handler: handlePaystackWebhook,
});
```

### 10.3 HTTPS Enforcement

- All production traffic encrypted via Convex/Next.js defaults
- Clerk enforces HTTPS for authentication flows

---

## 11. Security Checklist

### Pre-Deployment Checklist

```markdown
## Authentication & Authorization
- [ ] All mutations call requireAuth()
- [ ] All school-scoped operations call requireSchoolMembership()
- [ ] Principal-only operations call requirePrincipal()
- [ ] Superadmin operations verify superadmin role

## Input Validation
- [ ] All function args use v.* validators
- [ ] Business rule validation in handlers
- [ ] Custom validators for special formats (e.g., hex colors)

## Rate Limiting
- [ ] Server-side rate limiting on critical mutations
- [ ] Client-side rate limiting on forms
- [ ] Rate limit cleanup cron job configured

## Tenant Isolation
- [ ] All queries filter by schoolId
- [ ] All mutations verify school membership
- [ ] Search indexes include schoolId in filterFields

## Audit Logging
- [ ] All mutations log to report_logs
- [ ] Superadmin operations log to platform_audit_logs
- [ ] Webhook events logged

## Webhook Security
- [ ] Webhook secrets validated
- [ ] Idempotency checks implemented
- [ ] Webhook events logged

## Data Protection
- [ ] Sensitive data encrypted at rest
- [ ] Secrets stored in environment variables
- [ ] No sensitive data in client-side code
```

### Runtime Security Monitoring

| Metric | Threshold | Action |
|--------|-----------|--------|
| Failed auth attempts | > 10/hour | Alert |
| Rate limit triggers | > 50/hour | Alert |
| Cross-tenant access attempts | > 0 | Immediate alert |
| Webhook failures | > 5/hour | Alert |

---

## 12. Incident Response

### 12.1 Security Incident Classification

| Severity | Description | Response Time |
|----------|-------------|---------------|
| Critical | Data breach, cross-tenant access | Immediate |
| High | Authentication bypass, privilege escalation | 1 hour |
| Medium | Rate limit bypass, webhook compromise | 4 hours |
| Low | Failed attacks, suspicious activity | 24 hours |

### 12.2 Response Procedures

**Critical Incident:**
1. Immediately revoke compromised credentials
2. Check audit logs for scope of breach
3. Notify affected users
4. Document incident and remediation

**High Incident:**
1. Review access logs
2. Rotate secrets if compromised
3. Patch vulnerability
4. Update security documentation

### 12.3 Security Contacts

| Role | Contact | Responsibilities |
|------|---------|------------------|
| Security Lead | [To be assigned] | Incident response coordination |
| Developer | [Your name] | Technical remediation |
| User Support | [To be assigned] | User notification |

---

## Appendix A: Security Configuration Files

| File | Purpose |
|------|---------|
| `convex/auth.config.ts` | Convex auth provider |
| `convex/helpers.ts` | Authorization functions |
| `convex/rateLimit.ts` | Server-side rate limiting |
| `src/lib/rate-limit.ts` | Client-side rate limiting |
| `convex/webhooks.ts` | Webhook handlers |
| `convex/lib/logger.ts` | Structured logging |

## Appendix B: Security Audit History

| Date | Auditor | Findings | Status |
|------|---------|----------|--------|
| 2026-07-13 | Automated | Initial security analysis | Implemented |
| 2026-08-08 | Buffy | Server-side rate limiting added | Implemented |
| 2026-08-08 | Buffy | Security audit document created | Complete |

---

**Document Owner:** Development Team  
**Review Cycle:** Quarterly  
**Next Review:** 2026-11-08

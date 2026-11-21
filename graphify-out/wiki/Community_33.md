# Community 33

> 16 nodes · cohesion 0.22

## Key Concepts

- **refreshSession()** (17 connections) — `server/src/auth/service.ts`
- **issueSession()** (13 connections) — `server/src/auth/service.ts`
- **verifyMfa()** (12 connections) — `server/src/auth/service.ts`
- **confirmMfa()** (11 connections) — `server/src/auth/service.ts`
- **loadUserById()** (8 connections) — `server/src/auth/principals.ts`
- **enforceRateLimit()** (8 connections) — `server/src/auth/rate-limit.ts`
- **loadMembershipContext()** (7 connections) — `server/src/auth/service.ts`
- **signAccessToken()** (6 connections) — `server/src/auth/tokens.ts`
- **verifyMfaChallenge()** (5 connections) — `server/src/auth/tokens.ts`
- **.decrypt()** (5 connections) — `server/src/kms/local.ts`
- **toUserView()** (4 connections) — `server/src/auth/service.ts`
- **buildClaims()** (3 connections) — `server/src/auth/service.ts`
- **normalizeIp()** (3 connections) — `server/src/auth/service.ts`
- **normalizeUserAgent()** (3 connections) — `server/src/auth/service.ts`
- **resolveMembership()** (3 connections) — `server/src/auth/service.ts`
- **toMembershipClaims()** (3 connections) — `server/src/auth/service.ts`

## Relationships

- [Community 5](Community_5.md) (24 shared connections)
- [Community 9](Community_9.md) (13 shared connections)
- [Community 23](Community_23.md) (6 shared connections)
- [Community 17](Community_17.md) (5 shared connections)
- [Community 11](Community_11.md) (3 shared connections)
- [Community 38](Community_38.md) (3 shared connections)
- [Community 41](Community_41.md) (2 shared connections)
- [Community 10](Community_10.md) (2 shared connections)
- [Community 20](Community_20.md) (1 shared connections)

## Source Files

- `server/src/auth/principals.ts`
- `server/src/auth/rate-limit.ts`
- `server/src/auth/service.ts`
- `server/src/auth/tokens.ts`
- `server/src/kms/local.ts`

## Audit Trail

- EXTRACTED: 80 (94%)
- INFERRED: 5 (6%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [index](index.md) to navigate.*
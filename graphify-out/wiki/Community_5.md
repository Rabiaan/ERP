# Community 5

> 51 nodes · cohesion 0.08

## Key Concepts

- **auth/service.ts** (85 connections) — `server/src/auth/service.ts`
- **principals.ts** (25 connections) — `server/src/auth/principals.ts`
- **login()** (22 connections) — `server/src/auth/service.ts`
- **.query()** (22 connections) — `server/src/db/platform.ts`
- **password.ts** (21 connections) — `server/src/auth/password.ts`
- **hashPassword()** (16 connections) — `server/src/auth/password.ts`
- **changePassword()** (10 connections) — `server/src/auth/service.ts`
- **enrollMfa()** (9 connections) — `server/src/auth/service.ts`
- **acceptInvite()** (8 connections) — `server/src/auth/service.ts`
- **resetPassword()** (8 connections) — `server/src/auth/service.ts`
- **assertPasswordAllowed()** (7 connections) — `server/src/auth/password.ts`
- **verifyPassword()** (5 connections) — `server/src/auth/password.ts`
- **clearLoginFailures()** (5 connections) — `server/src/auth/principals.ts`
- **loadTenantMemberships()** (5 connections) — `server/src/auth/principals.ts`
- **markInviteUsed()** (5 connections) — `server/src/auth/principals.ts`
- **setMfaSecret()** (5 connections) — `server/src/auth/principals.ts`
- **updatePasswordHash()** (5 connections) — `server/src/auth/principals.ts`
- **resolveUserMembershipPermissionHashes()** (5 connections) — `server/src/authz/resolver.ts`
- **verifyDummyPassword()** (4 connections) — `server/src/auth/password.ts`
- **findInviteByHash()** (4 connections) — `server/src/auth/principals.ts`
- **setMfaEnabled()** (4 connections) — `server/src/auth/principals.ts`
- **revokeOtherSessions()** (4 connections) — `server/src/auth/sessions.ts`
- **buildTotpUri()** (4 connections) — `server/src/auth/totp.ts`
- **.encrypt()** (4 connections) — `server/src/kms/local.ts`
- **argon2** (3 connections) — `package.json`
- *... and 26 more nodes in this community*

## Relationships

- [Community 33](Community_33.md) (24 shared connections)
- [Community 17](Community_17.md) (20 shared connections)
- [Community 9](Community_9.md) (19 shared connections)
- [Community 23](Community_23.md) (12 shared connections)
- [Community 25](Community_25.md) (7 shared connections)
- [Community 10](Community_10.md) (7 shared connections)
- [Community 7](Community_7.md) (6 shared connections)
- [Community 41](Community_41.md) (6 shared connections)
- [Community 21](Community_21.md) (5 shared connections)
- [Community 8](Community_8.md) (5 shared connections)
- [Community 11](Community_11.md) (4 shared connections)
- [Community 20](Community_20.md) (4 shared connections)

## Source Files

- `package.json`
- `server/src/auth/password.ts`
- `server/src/auth/principals.ts`
- `server/src/auth/service.ts`
- `server/src/auth/sessions.ts`
- `server/src/auth/tokens.ts`
- `server/src/auth/totp.ts`
- `server/src/auth/types.ts`
- `server/src/authz/resolver.ts`
- `server/src/db/platform.ts`
- `server/src/kms/local.ts`

## Audit Trail

- EXTRACTED: 214 (90%)
- INFERRED: 25 (10%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [index](index.md) to navigate.*
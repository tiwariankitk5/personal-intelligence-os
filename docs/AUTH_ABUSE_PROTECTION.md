# Authentication abuse protection

Both browser-session and legacy JWT login/registration routes share these controls. This is an application safeguard, not a public-release certification.

| Control | Default | Configuration |
| --- | --- | --- |
| Login requests per source IP | 30 / 60 seconds | `PIOS_AUTH_LOGIN_IP_LIMIT` |
| Registration requests per source IP | 5 / 600 seconds | `PIOS_AUTH_REGISTER_IP_LIMIT` |
| Login requests per normalized email, across IPs | 10 / 60 seconds | `PIOS_AUTH_ACCOUNT_LOGIN_LIMIT` |
| Failed credentials before cooldown | 5 within 900 seconds | `PIOS_AUTH_FAILED_LOGIN_LIMIT`, `PIOS_AUTH_FAILURE_WINDOW_SECONDS` |
| Cooldown | 60 seconds | `PIOS_AUTH_COOLDOWN_SECONDS` |

- IP quotas run before body validation, CSRF and BCrypt. Invalid requests count too; browser and JWT routes cannot bypass one another's budget. Existing accounts and unknown emails receive the same credential-failure and cooldown messages.
- A blocked request returns HTTP 429, `Retry-After` seconds and a safe UI message. Cooldowns expire automatically; success clears failure history, but not request quotas. An account request quota also caps concurrent starts before credentials are checked.
- V5 stores HMAC-keyed counters in PostgreSQL. Row locks and independent transactions make counters atomic across backend instances and preserve failures across rollback/restart. Replicas must share the database and JWT secret and have synchronized clocks. JWT-secret rotation changes counter keys; it also changes audit references.
- The application uses the connection's remote address and defaults forwarded-header processing to `none`. Untrusted `Forwarded`/`X-Forwarded-For` headers cannot reset quotas. Behind an ingress/proxy, clients share its source budget until operators configure a strictly trusted proxy chain and block direct backend access. Pair this with ingress rate/concurrency/body-size controls; shared NATs may require tuned budgets.
- The `pios.security.auth` logger records operation/outcome and keyed source/actor references. It does not record email, raw IP, request body, passwords, cookies, tokens or exception details. References remain pseudonymous data: restrict log access and retention. Database SQL bind-value tracing must remain disabled in deployed environments.
- Expired counters are removed every ten minutes; active cooldowns survive cleanup. Database protection failures fail closed with HTTP 503 and a retry hint. No refresh-token, email verification, password reset or broader account lifecycle is implied by this change.

## Verification

- Java tests cover concurrent shared counters, independent commits, source/account quotas, failure windows, cooldown recovery, unknown-account parity, successful login, expiry cleanup, redacted logs, CSRF and unavailable storage.
- `scripts/auth-abuse-smoke.mjs` exercises actual PostgreSQL-backed HTTP routes and cooldown recovery. It intentionally exhausts quotas and requires `PIOS_AUTH_SMOKE_DISPOSABLE=true` plus a **2-second cooldown on a disposable deployment**. Never run it against a user/production stack. CI runs it after the ordinary API smoke test.
- Ordinary local API checks still use `scripts/verify-pios.ps1 -Scope backend -Smoke`; they do not intentionally exhaust authentication quotas. Repeated account-creating runs within ten minutes can still hit the normal registration limit.

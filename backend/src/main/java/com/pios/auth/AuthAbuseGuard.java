package com.pios.auth;

import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Locale;
import java.util.function.Function;
import java.util.function.Supplier;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

/** Shared SQL counters: independent commits preserve failed attempts even when authentication fails. */
@Service
public class AuthAbuseGuard {
    private static final Logger audit = LoggerFactory.getLogger("pios.security.auth");
    private final JdbcTemplate jdbc;
    private final TransactionTemplate transactions;
    private final Clock clock;
    private final byte[] secret;
    private final Policy policy;

    @Autowired
    public AuthAbuseGuard(JdbcTemplate jdbc, PlatformTransactionManager manager, Clock authAbuseClock,
            @Value("${app.jwt.secret-base64}") String secret,
            @Value("${app.auth-abuse.login-ip-limit:30}") int loginIpLimit,
            @Value("${app.auth-abuse.registration-ip-limit:5}") int registrationIpLimit,
            @Value("${app.auth-abuse.account-login-limit:10}") int accountLoginLimit,
            @Value("${app.auth-abuse.failed-login-limit:5}") int failedLoginLimit,
            @Value("${app.auth-abuse.failure-window-seconds:900}") int failureWindowSeconds,
            @Value("${app.auth-abuse.cooldown-seconds:60}") int cooldownSeconds) {
        this(jdbc, manager, authAbuseClock, secret, new Policy(loginIpLimit, registrationIpLimit,
                accountLoginLimit, failedLoginLimit, failureWindowSeconds, cooldownSeconds));
    }

    AuthAbuseGuard(JdbcTemplate jdbc, PlatformTransactionManager manager, Clock clock, String secret, Policy policy) {
        this.jdbc = jdbc;
        this.clock = clock;
        this.secret = Base64.getDecoder().decode(secret);
        this.policy = policy;
        transactions = new TransactionTemplate(manager);
        transactions.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        transactions.setTimeout(3);
    }

    record Policy(int loginIpLimit, int registrationIpLimit, int accountLoginLimit, int failedLoginLimit,
                  int failureWindowSeconds, int cooldownSeconds) {
        Policy {
            for (int value : new int[]{loginIpLimit, registrationIpLimit, accountLoginLimit,
                    failedLoginLimit, failureWindowSeconds, cooldownSeconds}) {
                if (value < 1 || value > 86400) throw new IllegalArgumentException("Invalid authentication abuse limit.");
            }
        }
    }

    public void request(String operation, String source) {
        boolean login = operation.equals("login");
        long retry = consume("ip-" + operation, source, login ? policy.loginIpLimit : policy.registrationIpLimit,
                login ? 60 : 600);
        if (retry > 0) {
            log(operation, "throttled", source, "");
            throw new RateLimitedException(retry);
        }
    }

    public <T> T login(String email, String source, Supplier<T> authenticate) {
        String actor = email.trim().toLowerCase(Locale.ROOT);
        long cooldown = bucket("failures", actor, policy.failureWindowSeconds, row -> {
            normalizeFailures(row);
            return row.blockedUntil == null ? 0L : secondsUntil(row.blockedUntil);
        });
        long retry = cooldown > 0 ? cooldown : consume("account-login", actor, policy.accountLoginLimit, 60);
        if (retry > 0) {
            log("login", "throttled", source, actor);
            throw new RateLimitedException(retry);
        }
        T result;
        try {
            result = authenticate.get();
        } catch (BadCredentialsException ex) {
            bucket("failures", actor, policy.failureWindowSeconds, row -> {
                normalizeFailures(row);
                if (row.blockedUntil == null && ++row.attempts >= policy.failedLoginLimit) {
                    row.blockedUntil = clock.instant().plusSeconds(policy.cooldownSeconds);
                    if (row.expiresAt.isBefore(row.blockedUntil)) row.expiresAt = row.blockedUntil;
                }
                return null;
            });
            log("login", "failure", source, actor);
            throw ex;
        }
        bucket("failures", actor, policy.failureWindowSeconds, row -> { row.reset(clock.instant(), policy.failureWindowSeconds); return null; });
        log("login", "success", source, actor);
        return result;
    }

    public <T> T register(String email, String source, Supplier<T> register) {
        try {
            T result = register.get();
            log("register", "success", source, email);
            return result;
        } catch (RuntimeException ex) {
            log("register", "failure", source, email);
            throw ex;
        }
    }

    private long consume(String kind, String identity, int limit, int seconds) {
        return bucket(kind, identity, seconds, row -> {
            if (!clock.instant().isBefore(row.windowStart.plusSeconds(seconds))) row.reset(clock.instant(), seconds);
            if (row.attempts >= limit) return secondsUntil(row.windowStart.plusSeconds(seconds));
            row.attempts++;
            return 0L;
        });
    }

    private void normalizeFailures(Bucket row) {
        Instant now = clock.instant();
        if (row.blockedUntil != null) {
            if (!now.isBefore(row.blockedUntil)) row.reset(now, policy.failureWindowSeconds);
        } else if (!now.isBefore(row.windowStart.plusSeconds(policy.failureWindowSeconds))) {
            row.reset(now, policy.failureWindowSeconds);
        }
    }

    private long secondsUntil(Instant end) {
        return Math.max(1, (Duration.between(clock.instant(), end).toMillis() + 999) / 1000);
    }

    private <T> T bucket(String kind, String identity, int seconds, Function<Bucket,T> work) {
        String id = fingerprint(kind, identity);
        try {
            return transactions.execute(status -> {
                Instant now = clock.instant();
                // PostgreSQL and H2 PostgreSQL mode support conflict-ignore, including concurrent first requests.
                jdbc.update("INSERT INTO auth_abuse_buckets(bucket_key,window_start,attempts,expires_at) VALUES (?,?,0,?) ON CONFLICT DO NOTHING",
                        id, Timestamp.from(now), Timestamp.from(now.plusSeconds(seconds)));
                Bucket row = jdbc.queryForObject("SELECT window_start,attempts,blocked_until,expires_at FROM auth_abuse_buckets WHERE bucket_key=? FOR UPDATE",
                        (rs, n) -> new Bucket(rs.getTimestamp(1).toInstant(), rs.getInt(2),
                                rs.getTimestamp(3) == null ? null : rs.getTimestamp(3).toInstant(), rs.getTimestamp(4).toInstant()), id);
                T result = work.apply(row);
                jdbc.update("UPDATE auth_abuse_buckets SET window_start=?,attempts=?,blocked_until=?,expires_at=? WHERE bucket_key=?",
                        Timestamp.from(row.windowStart), row.attempts, row.blockedUntil == null ? null : Timestamp.from(row.blockedUntil), Timestamp.from(row.expiresAt), id);
                return result;
            });
        } catch (DataAccessException ex) {
            // Never fall back to unrestricted authentication if shared protection is unavailable.
            audit.error("auth_event=protection_unavailable");
            throw new ProtectionUnavailableException();
        }
    }

    @Scheduled(fixedDelayString = "${app.auth-abuse.cleanup-ms:600000}", initialDelayString = "${app.auth-abuse.cleanup-ms:600000}")
    public void cleanup() {
        try { jdbc.update("DELETE FROM auth_abuse_buckets WHERE expires_at < ?", Timestamp.from(clock.instant())); }
        catch (DataAccessException ex) { audit.error("auth_event=cleanup_unavailable"); }
    }

    private String fingerprint(String kind, String value) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret, "HmacSHA256"));
            return HexFormat.of().formatHex(mac.doFinal(("pios-auth-v1\0" + kind + "\0" + value.trim().toLowerCase(Locale.ROOT)).getBytes(StandardCharsets.UTF_8)));
        } catch (java.security.GeneralSecurityException ex) { throw new IllegalStateException("Authentication protection could not initialize."); }
    }

    private void log(String operation, String outcome, String source, String actor) {
        audit.info("auth_event={} outcome={} source_ref={} actor_ref={}", operation, outcome,
                fingerprint("audit-source", source).substring(0,16), fingerprint("audit-actor", actor).substring(0,16));
    }

    private static class Bucket {
        Instant windowStart, blockedUntil, expiresAt;
        int attempts;
        Bucket(Instant start, int attempts, Instant blocked, Instant expires) { this.windowStart=start; this.attempts=attempts; this.blockedUntil=blocked; this.expiresAt=expires; }
        void reset(Instant now, int seconds) { windowStart=now; attempts=0; blockedUntil=null; expiresAt=now.plusSeconds(seconds); }
    }
    public static class RateLimitedException extends RuntimeException {
        private final long retryAfter;
        public RateLimitedException(long retryAfter) { super("Too many attempts. Try again in " + retryAfter + " seconds."); this.retryAfter=retryAfter; }
        public long retryAfter() { return retryAfter; }
    }
    public static class ProtectionUnavailableException extends RuntimeException {
        public ProtectionUnavailableException() { super("Sign-in is temporarily unavailable. Please try again."); }
    }
}

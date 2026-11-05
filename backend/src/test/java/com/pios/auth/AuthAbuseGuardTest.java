package com.pios.auth;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabase;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabaseBuilder;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabaseType;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.transaction.support.TransactionTemplate;
import static org.junit.jupiter.api.Assertions.*;

@ExtendWith(OutputCaptureExtension.class)
class AuthAbuseGuardTest {
    static final String SECRET="cGlvcy10ZXN0LXNlY3JldC1rZXktMzItYnl0ZXMhISE=";
    EmbeddedDatabase db;
    JdbcTemplate jdbc;
    DataSourceTransactionManager manager;
    MutableClock clock;
    AuthAbuseGuard guard;
    final AuthAbuseGuard.Policy policy = new AuthAbuseGuard.Policy(3,2,10,3,900,60);

    @BeforeEach void setup() {
        db=new EmbeddedDatabaseBuilder().setType(EmbeddedDatabaseType.H2)
                .setName("abuse-"+java.util.UUID.randomUUID()+";MODE=PostgreSQL")
                .addScript("auth-abuse-schema.sql").build();
        jdbc=new JdbcTemplate(db); manager=new DataSourceTransactionManager(db);
        clock=new MutableClock(); guard=new AuthAbuseGuard(jdbc,manager,clock,SECRET,policy);
    }
    @AfterEach void close() { db.shutdown(); }
    void fail(String actor) { assertThrows(BadCredentialsException.class,()->guard.login(actor,"source",()->{throw new BadCredentialsException("bad credentials");})); }

    @Test void ipLimitsAreIndependentAndAutomaticallyRecover() {
        for(int i=0;i<3;i++) guard.request("login","source");
        assertEquals(60,assertThrows(AuthAbuseGuard.RateLimitedException.class,()->guard.request("login","source")).retryAfter());
        guard.request("login","other");
        guard.request("register","source"); guard.request("register","source");
        assertEquals(600,assertThrows(AuthAbuseGuard.RateLimitedException.class,()->guard.request("register","source")).retryAfter());
        clock.advance(61); guard.request("login","source");
        clock.advance(540); guard.request("register","source");
    }
    @Test void failuresBlockAcrossSourcesAndCaseUntilCooldownEnds() {
        fail("Person@example.com"); fail("person@example.com"); fail("PERSON@example.com");
        AtomicInteger calls=new AtomicInteger();
        assertEquals(60,assertThrows(AuthAbuseGuard.RateLimitedException.class,
                ()->guard.login("person@example.com","different-source",calls::incrementAndGet)).retryAfter());
        assertEquals(0,calls.get());
        clock.advance(61); assertEquals(1,guard.login("person@example.com","different-source",calls::incrementAndGet));
    }
    @Test void successClearsFailuresAndExpiredFailureWindowsReset() {
        fail("person@example.com"); fail("person@example.com");
        assertEquals("ok",guard.login("person@example.com","source",()->"ok"));
        fail("person@example.com"); fail("person@example.com");
        clock.advance(901); fail("person@example.com");
        assertEquals("ok",guard.login("person@example.com","source",()->"ok"));
    }
    @Test void accountRequestBudgetAlsoLimitsSuccessfulAndConcurrentAttempts() {
        guard=new AuthAbuseGuard(jdbc,manager,clock,SECRET,new AuthAbuseGuard.Policy(30,5,2,3,900,60));
        guard.login("person@example.com","a",()->"ok"); guard.login("person@example.com","b",()->"ok");
        assertThrows(AuthAbuseGuard.RateLimitedException.class,()->guard.login("person@example.com","c",()->"ok"));
        clock.advance(61); assertEquals("ok",guard.login("person@example.com","c",()->"ok"));
    }
    @Test void sharedInstancesEnforceOneAtomicQuotaUnderConcurrency() throws Exception {
        AuthAbuseGuard other=new AuthAbuseGuard(jdbc,manager,clock,SECRET,policy);
        try(var executor=Executors.newFixedThreadPool(8)) {
            CountDownLatch start=new CountDownLatch(1);
            var results=new ArrayList<Future<Boolean>>();
            for(int i=0;i<20;i++) { AuthAbuseGuard instance=i%2==0?guard:other; results.add(executor.submit(()->{
                start.await(); try {instance.request("login","same-source"); return true;} catch(AuthAbuseGuard.RateLimitedException ex){return false;}
            })); }
            start.countDown(); int accepted=0; for(var result:results) if(result.get()) accepted++;
            assertEquals(3,accepted);
        }
    }
    @Test void countersCommitIndependentlyOfFailedOuterTransactions() {
        new TransactionTemplate(manager).execute(status->{guard.request("login","source");status.setRollbackOnly();return null;});
        guard.request("login","source");guard.request("login","source");
        assertThrows(AuthAbuseGuard.RateLimitedException.class,()->guard.request("login","source"));
    }
    @Test void cleanupPreservesActiveCooldownEvenAfterItsFailureWindow() {
        guard=new AuthAbuseGuard(jdbc,manager,clock,SECRET,new AuthAbuseGuard.Policy(30,5,10,3,10,60));
        fail("person@example.com");fail("person@example.com");fail("person@example.com");
        clock.advance(11);guard.cleanup();
        assertEquals(49,assertThrows(AuthAbuseGuard.RateLimitedException.class,()->guard.login("person@example.com","x",()->"ok")).retryAfter());
        clock.advance(61);guard.cleanup();
        assertEquals(0,jdbc.queryForObject("SELECT COUNT(*) FROM auth_abuse_buckets",Integer.class));
        assertEquals("ok",guard.login("person@example.com","x",()->"ok"));
    }
    @Test void unavailableProtectionFailsClosed() {
        jdbc.execute("DROP TABLE auth_abuse_buckets");AtomicInteger calls=new AtomicInteger();
        assertThrows(AuthAbuseGuard.ProtectionUnavailableException.class,()->guard.login("private@example.com","source",calls::incrementAndGet));
        assertEquals(0,calls.get());
    }
    @Test void auditLogsAndStoredKeysExcludeRawIdentitiesAndCredentials(CapturedOutput output) {
        String email="private-person@example.com",ip="192.0.2.123",password="Never-log-this-password",token="Never-log-this-token";
        assertThrows(BadCredentialsException.class,()->guard.login(email,ip,()->{throw new BadCredentialsException(password);}));
        guard.login(email,ip,()->token); guard.register(email,ip,()->token);
        String logs=output.getAll();
        assertTrue(logs.contains("auth_event=login outcome=failure"));assertTrue(logs.contains("auth_event=login outcome=success"));
        for(String value:new String[]{email,ip,password,token}) assertFalse(logs.contains(value));
        assertTrue(jdbc.queryForList("SELECT bucket_key FROM auth_abuse_buckets",String.class).stream().allMatch(key->key.matches("[0-9a-f]{64}")));
    }

    static class MutableClock extends Clock {
        private Instant now=Instant.parse("2026-01-01T00:00:00Z");
        void advance(long seconds){now=now.plusSeconds(seconds);}
        void reset(){now=Instant.parse("2026-01-01T00:00:00Z");}
        @Override public ZoneId getZone(){return ZoneOffset.UTC;}
        @Override public Clock withZone(ZoneId zone){return this;}
        @Override public Instant instant(){return now;}
    }
}

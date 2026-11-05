package com.pios.auth;

import java.time.Clock;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.jdbc.Sql;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties={"app.auth-abuse.login-ip-limit=3","app.auth-abuse.registration-ip-limit=2","app.auth-abuse.failed-login-limit=3"},
        classes={com.pios.PersonalIntelligenceApplication.class,AuthAbuseIntegrationTest.TimeConfiguration.class})
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Sql("/auth-abuse-schema.sql")
class AuthAbuseIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired Clock clock;
    @Autowired org.springframework.jdbc.core.JdbcTemplate jdbc;
    @BeforeEach void resetTime(){((AuthAbuseGuardTest.MutableClock)clock).reset();}
    @TestConfiguration static class TimeConfiguration {
        @Bean @Primary Clock testAuthClock(){return new AuthAbuseGuardTest.MutableClock();}
    }
    MockHttpServletRequestBuilder request(String path,String source,String json){
        return post("/api/v1/auth/"+path).with(csrf()).with(r->{r.setRemoteAddr(source);return r;})
                .contentType(MediaType.APPLICATION_JSON).content(json);
    }

    @Test void ipQuotaCoversBothLoginRoutesAndCannotBeBypassedWithForwardingHeaders() throws Exception {
        for(int i=0;i<3;i++) mvc.perform(request(i%2==0?"login":"session/login","192.0.2.1","{}")
                        .header("X-Forwarded-For","192.0.2."+(100+i)).header("Forwarded","for=192.0.2."+(100+i)))
                .andExpect(status().isBadRequest());
        mvc.perform(request("session/login","192.0.2.1","{}")).andExpect(status().isTooManyRequests())
                .andExpect(header().string("Retry-After","60")).andExpect(header().string("Cache-Control","no-store"))
                .andExpect(jsonPath("$.message").value("Too many attempts. Try again in 60 seconds."));
        mvc.perform(request("login","192.0.2.2","{}")).andExpect(status().isBadRequest());
        ((AuthAbuseGuardTest.MutableClock)clock).advance(61);
        mvc.perform(request("login","192.0.2.1","{}")).andExpect(status().isBadRequest());
    }
    @Test void registrationQuotaIncludesInvalidBodiesAndBothRoutesThenRecovers() throws Exception {
        mvc.perform(request("register","192.0.2.3","{}")).andExpect(status().isBadRequest());
        mvc.perform(request("session/register","192.0.2.3","{}")).andExpect(status().isBadRequest());
        mvc.perform(request("register","192.0.2.3","{}")).andExpect(status().isTooManyRequests()).andExpect(header().string("Retry-After","600"));
        ((AuthAbuseGuardTest.MutableClock)clock).advance(601);
        mvc.perform(request("session/register","192.0.2.3","{}")).andExpect(status().isBadRequest());
    }
    @Test void failedLoginsTriggerCrossRouteCooldownAndNormalLoginRecovers() throws Exception {
        String email="cooldown-"+UUID.randomUUID()+"@example.com";
        String valid="{\"displayName\":\"Cooldown Test\",\"email\":\""+email+"\",\"password\":\"correct-horse-123\"}";
        mvc.perform(request("session/register","192.0.2.4",valid)).andExpect(status().isCreated());
        String bad="{\"email\":\""+email+"\",\"password\":\"wrong-password\"}";
        for(int i=0;i<3;i++) mvc.perform(request(i%2==0?"session/login":"login","192.0.2."+(10+i),bad))
                .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.message").value("Email or password is incorrect."));
        mvc.perform(request("session/login","192.0.2.20",valid)).andExpect(status().isTooManyRequests()).andExpect(header().string("Retry-After","60"));
        ((AuthAbuseGuardTest.MutableClock)clock).advance(61);
        mvc.perform(request("session/login","192.0.2.20",valid)).andExpect(status().isOk()).andExpect(jsonPath("$.email").value(email));
        mvc.perform(request("login","192.0.2.21",valid)).andExpect(status().isOk()).andExpect(jsonPath("$.accessToken").isNotEmpty());
    }
    @Test void unknownAccountsReceiveSameFailureAndCooldownResponses() throws Exception {
        String body="{\"email\":\"missing-"+UUID.randomUUID()+"@example.com\",\"password\":\"wrong-password\"}";
        for(int i=0;i<3;i++) mvc.perform(request("login","192.0.2."+(30+i),body)).andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("Email or password is incorrect."));
        mvc.perform(request("session/login","192.0.2.40",body)).andExpect(status().isTooManyRequests())
                .andExpect(header().string("Retry-After","60"));
    }
    @Test void csrfProtectionRemainsRequired() throws Exception {
        mvc.perform(post("/api/v1/auth/session/login").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isForbidden());
    }
    @Test void missingProtectionStorageReturnsUnavailableRatherThanAllowingLogin() throws Exception {
        jdbc.execute("DROP TABLE auth_abuse_buckets");
        mvc.perform(request("session/login","192.0.2.50","{}"))
                .andExpect(status().isServiceUnavailable()).andExpect(header().string("Retry-After","5"))
                .andExpect(jsonPath("$.message").value("Sign-in is temporarily unavailable. Please try again."));
    }
}

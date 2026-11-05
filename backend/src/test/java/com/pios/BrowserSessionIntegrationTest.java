package com.pios;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.jdbc.Sql;
import org.springframework.test.web.servlet.MockMvc;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Sql("/auth-abuse-schema.sql")
class BrowserSessionIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;

    @Test
    void browserSessionRotatesProtectsWritesAndIsRevokedOnLogout() throws Exception {
        var csrfResult = mvc.perform(get("/api/v1/auth/csrf"))
                .andExpect(status().isOk()).andReturn();
        var anonymous = (MockHttpSession) csrfResult.getRequest().getSession(false);
        String anonymousId = anonymous.getId();
        String csrf = mapper.readTree(csrfResult.getResponse().getContentAsString()).get("token").asText();
        String email = UUID.randomUUID() + "@example.com";
        String registration = mapper.writeValueAsString(java.util.Map.of(
                "displayName", "Session User", "email", email, "password", "correct-horse-123"));

        mvc.perform(post("/api/v1/auth/session/register").session(anonymous)
                        .contentType(MediaType.APPLICATION_JSON).content(registration))
                .andExpect(status().isForbidden());
        var registered = mvc.perform(post("/api/v1/auth/session/register").session(anonymous)
                        .header("X-CSRF-TOKEN", csrf).contentType(MediaType.APPLICATION_JSON).content(registration))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.email").value(email))
                .andExpect(jsonPath("$.accessToken").doesNotExist()).andReturn();
        var session = (MockHttpSession) registered.getRequest().getSession(false);
        assertNotEquals(anonymousId, session.getId(), "Sign-in must rotate the anonymous session ID");
        mvc.perform(get("/api/v1/profile/me").session(session))
                .andExpect(status().isOk()).andExpect(jsonPath("$.email").value(email));

        mvc.perform(post("/api/v1/workspaces").session(session)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"CSRF blocked\",\"type\":\"PERSONAL\"}"))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/auth/logout").session(session).header("X-CSRF-TOKEN", csrf))
                .andExpect(status().isForbidden());
        assertFalse(session.isInvalid(), "A forged logout must not invalidate the session");

        String freshCsrf = token(session);
        mvc.perform(post("/api/v1/workspaces").session(session).header("X-CSRF-TOKEN", freshCsrf)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"CSRF accepted\",\"type\":\"PERSONAL\"}"))
                .andExpect(status().isCreated());
        mvc.perform(post("/api/v1/auth/logout").session(session).header("X-CSRF-TOKEN", freshCsrf))
                .andExpect(status().isNoContent());
        assertTrue(session.isInvalid());
        mvc.perform(get("/api/v1/profile/me")).andExpect(status().isUnauthorized());

        // A fresh login must establish a new session and return no bearer credential.
        var loginCsrf = mvc.perform(get("/api/v1/auth/csrf")).andReturn();
        var loginSession = (MockHttpSession) loginCsrf.getRequest().getSession(false);
        String loginToken = mapper.readTree(loginCsrf.getResponse().getContentAsString()).get("token").asText();
        String loginBody = mapper.writeValueAsString(java.util.Map.of("email", email, "password", "correct-horse-123"));
        mvc.perform(post("/api/v1/auth/session/login").session(loginSession).header("X-CSRF-TOKEN", loginToken)
                        .contentType(MediaType.APPLICATION_JSON).content(loginBody))
                .andExpect(status().isOk()).andExpect(jsonPath("$.accessToken").doesNotExist());
        mvc.perform(get("/api/v1/profile/me").session(loginSession)).andExpect(status().isOk());
    }

    @Test
    void loginRequiresCsrfAndInvalidPasswordDoesNotAuthenticate() throws Exception {
        String login = "{\"email\":\"unknown@example.com\",\"password\":\"wrong-password\"}";
        mvc.perform(post("/api/v1/auth/session/login").contentType(MediaType.APPLICATION_JSON).content(login))
                .andExpect(status().isForbidden());
        var result = mvc.perform(get("/api/v1/auth/csrf")).andReturn();
        var session = (MockHttpSession) result.getRequest().getSession(false);
        String csrf = mapper.readTree(result.getResponse().getContentAsString()).get("token").asText();
        mvc.perform(post("/api/v1/auth/session/login").session(session).header("X-CSRF-TOKEN", csrf)
                        .contentType(MediaType.APPLICATION_JSON).content(login))
                .andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/profile/me").session(session)).andExpect(status().isUnauthorized());
    }

    private String token(MockHttpSession session) throws Exception {
        var result = mvc.perform(get("/api/v1/auth/csrf").session(session)).andExpect(status().isOk()).andReturn();
        return mapper.readTree(result.getResponse().getContentAsString()).get("token").asText();
    }
}

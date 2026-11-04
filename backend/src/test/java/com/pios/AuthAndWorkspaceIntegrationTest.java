package com.pios;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AuthAndWorkspaceIntegrationTest {

    @Autowired MockMvc mockMvc;
    @Autowired ObjectMapper objectMapper;

    @Test
    void userCanRegisterAndReadPrivateProfileAndWorkspace() throws Exception {
        String response = mockMvc.perform(post("/api/v1/auth/register")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "displayName": "Test User",
                                  "email": "test-user@example.com",
                                  "password": "correct-horse-123",
                                  "roles": ["UNIVERSITY_STUDENT"],
                                  "interests": ["Computer Science"],
                                  "goals": ["Structured learning"]
                                }
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.accessToken").isNotEmpty())
                .andReturn().getResponse().getContentAsString();

        JsonNode body = objectMapper.readTree(response);
        String token = body.get("accessToken").asText();
        String authorization = "Bearer " + token;

        mockMvc.perform(get("/api/v1/profile/me").header("Authorization", authorization))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value("test-user@example.com"))
                .andExpect(jsonPath("$.displayName").value("Test User"));

        mockMvc.perform(get("/api/v1/workspaces").header("Authorization", authorization))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].name").value("Personal"))
                .andExpect(jsonPath("$[0].defaultWorkspace").value(true));
    }

    @Test
    void duplicateEmailIsRejected() throws Exception {
        String payload = """
                {
                  "displayName": "Duplicate User",
                  "email": "duplicate@example.com",
                  "password": "correct-horse-123"
                }
                """;

        mockMvc.perform(post("/api/v1/auth/register").with(csrf()).contentType(MediaType.APPLICATION_JSON).content(payload))
                .andExpect(status().isCreated());
        mockMvc.perform(post("/api/v1/auth/register").with(csrf()).contentType(MediaType.APPLICATION_JSON).content(payload))
                .andExpect(status().isConflict());
    }

    @Test
    void protectedEndpointsRejectRequestsWithoutToken() throws Exception {
        mockMvc.perform(get("/api/v1/profile/me"))
                .andExpect(status().isUnauthorized());
    }
}

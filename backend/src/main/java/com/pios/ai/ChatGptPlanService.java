package com.pios.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.security.oauth2.jwt.JwtIssuerValidator;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.util.UriComponentsBuilder;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import org.springframework.http.client.ClientHttpResponse;

@Service
public class ChatGptPlanService {
    private static final String ISSUER = "https://auth.openai.com";
    private static final String AUTHORIZE_ENDPOINT = ISSUER + "/api/accounts/authorize";
    private static final String TOKEN_ENDPOINT = ISSUER + "/api/accounts/oauth/token";
    private static final String REVOCATION_ENDPOINT = ISSUER + "/api/accounts/oauth/revoke";
    private static final String JWKS_URI = ISSUER + "/.well-known/jwks.json";
    private static final String RESOURCE = "https://api.openai.com/v1";
    private static final String REQUIRED_PLAN_SCOPE = "chatgpt.tokens.use.direct";
    private static final String REQUIRED_RESOURCE_SCOPE = "resource.invoke";
    private static final String PROVIDER_TYPE = "CHATGPT_PLAN";
    private static final SecureRandom RANDOM = new SecureRandom();

    private final org.springframework.jdbc.core.JdbcTemplate jdbc;
    private final SecretEncryptionService encryption;
    private final ObjectMapper mapper;
    private final RestClient http = RestClient.create();

    @Value("${app.chatgpt.oauth.redirect-uri:http://127.0.0.1:8080/auth/callback}")
    private String redirectUri;

    public ChatGptPlanService(org.springframework.jdbc.core.JdbcTemplate jdbc,
                              SecretEncryptionService encryption,
                              ObjectMapper mapper) {
        this.jdbc = jdbc;
        this.encryption = encryption;
        this.mapper = mapper;
    }

    @Transactional
    public ConnectStart start(UUID userId) {
        validateLoopbackRedirect();
        jdbc.update("DELETE FROM ai_chatgpt_oauth_attempts WHERE expires_at < now()");
        jdbc.update("DELETE FROM ai_chatgpt_pending_connections WHERE expires_at < now()");

        String hostId = hostId();
        Registration registration = registration(userId);
        String clientId = registration == null ? "dynamic_agent_client" : registration.clientId();
        String state = randomValue(32);
        String nonce = randomValue(32);
        String verifier = randomValue(48);
        String challenge = base64Url(sha256(verifier.getBytes(StandardCharsets.US_ASCII)));
        String stateHash = hex(sha256(state.getBytes(StandardCharsets.US_ASCII)));
        String launchToken = randomValue(32);
        String launchHash = hex(sha256(launchToken.getBytes(StandardCharsets.US_ASCII)));

        String idTokenHint = null;
        String loginHint = null;
        Connection connection = connection(userId);
        if (connection != null && registration != null && connection.encryptedIdToken() != null) {
            idTokenHint = encryption.decrypt(connection.encryptedIdToken());
            loginHint = connection.email();
        }

        UriComponentsBuilder builder = UriComponentsBuilder.fromUriString(AUTHORIZE_ENDPOINT)
                .queryParam("client_id", clientId)
                .queryParam("ext_agent_host_id", hostId)
                .queryParam("response_type", "code")
                .queryParam("redirect_uri", redirectUri)
                .queryParam("scope", "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct")
                .queryParam("resource", RESOURCE)
                .queryParam("state", state)
                .queryParam("nonce", nonce)
                .queryParam("code_challenge_method", "S256")
                .queryParam("code_challenge", challenge);

        if (registration == null) {
            builder.queryParam("agent_name_hint", "Personal Intelligence OS");
        } else {
            if (idTokenHint != null && !idTokenHint.isBlank()) builder.queryParam("id_token_hint", idTokenHint);
            if (loginHint != null && !loginHint.isBlank()) builder.queryParam("login_hint", loginHint);
            // This action is offered when the user explicitly chooses to review/enable plan permission.
            if (connection != null && !connection.planUsageEnabled()) builder.queryParam("prompt", "consent");
        }

        String openAiAuthorizationUrl = builder.build().encode().toUriString();
        Instant expiresAt = Instant.now().plusSeconds(600);
        jdbc.update("""
                INSERT INTO ai_chatgpt_oauth_attempts
                    (state_hash,launch_hash,user_id,nonce,encrypted_pkce_verifier,redirect_uri,client_id,
                     ext_agent_host_id,encrypted_authorization_url,expires_at)
                VALUES (?,?,?,?,?,?,?,?,?,?)
                """,
                stateHash, launchHash, userId, nonce, encryption.encrypt(verifier), redirectUri,
                registration == null ? null : registration.clientId(), hostId,
                encryption.encrypt(openAiAuthorizationUrl), expiresAt);

        String launchUrl = UriComponentsBuilder.fromUriString(redirectUri)
                .replacePath("/auth/start").replaceQuery(null)
                .queryParam("launch", launchToken).build().encode().toUriString();
        // The OpenAI authorization URL can contain id_token_hint. Never return it to browser JavaScript.
        return new ConnectStart(launchUrl, redirectUri);
    }

    @Transactional
    public String launchAuthorization(String launchToken) {
        if (launchToken == null || !launchToken.matches("[A-Za-z0-9_-]{40,100}")) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "This ChatGPT sign-in link is invalid or expired.");
        }
        String launchHash = hex(sha256(launchToken.getBytes(StandardCharsets.US_ASCII)));
        List<String> encryptedUrls = jdbc.query("""
                UPDATE ai_chatgpt_oauth_attempts
                SET launch_used_at=now()
                WHERE launch_hash=? AND launch_used_at IS NULL AND expires_at > now()
                RETURNING encrypted_authorization_url
                """, (rs, row) -> rs.getString("encrypted_authorization_url"), launchHash);
        if (encryptedUrls.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.GONE, "This ChatGPT sign-in link was already used or has expired. Return to PIOS and start again.");
        }
        return encryption.decrypt(encryptedUrls.get(0));
    }

    @Transactional
    public String completeCallback(String code, String state, String callbackClientId, String error) {
        if (state == null || state.isBlank()) return callbackPage(false, "The sign-in response was missing its security state.");
        String stateHash = hex(sha256(state.getBytes(StandardCharsets.US_ASCII)));
        List<PendingAttempt> attempts = jdbc.query("""
                DELETE FROM ai_chatgpt_oauth_attempts
                WHERE state_hash=? AND expires_at > now()
                RETURNING user_id,nonce,encrypted_pkce_verifier,redirect_uri,client_id,ext_agent_host_id
                """,
                (rs, row) -> new PendingAttempt(rs.getObject("user_id", UUID.class), rs.getString("nonce"),
                        rs.getString("encrypted_pkce_verifier"), rs.getString("redirect_uri"),
                        rs.getString("client_id"), rs.getString("ext_agent_host_id")), stateHash);
        if (attempts.isEmpty()) return callbackPage(false, "This sign-in request expired or was already used. Return to PIOS and start again.");
        PendingAttempt attempt = attempts.get(0);

        if (error != null && !error.isBlank()) {
            return callbackPage(false, "ChatGPT sign-in was cancelled or not authorised. No connection was made.");
        }
        if (code == null || code.isBlank()) return callbackPage(false, "OpenAI did not return an authorisation code. Start again from PIOS.");

        String clientId = attempt.clientId();
        if (clientId == null || clientId.isBlank()) {
            if (callbackClientId == null || callbackClientId.isBlank() || "dynamic_agent_client".equals(callbackClientId)) {
                return callbackPage(false, "OpenAI did not return the newly issued client registration. Start sign-in again.");
            }
            clientId = callbackClientId;
        } else if (callbackClientId != null && !callbackClientId.isBlank() && !clientId.equals(callbackClientId)) {
            return callbackPage(false, "The returned ChatGPT client did not match this sign-in attempt. Start again.");
        }

        Registration savedRegistration = registration(attempt.userId());
        if (savedRegistration != null && !savedRegistration.clientId().equals(clientId)) {
            return callbackPage(false, "The returned ChatGPT client did not match the client saved for this PIOS account. Start again.");
        }

        try {
            MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
            form.add("grant_type", "authorization_code");
            form.add("client_id", clientId);
            form.add("code", code);
            form.add("code_verifier", encryption.decrypt(attempt.encryptedVerifier()));
            form.add("redirect_uri", attempt.redirectUri());
            form.add("resource", RESOURCE);
            JsonNode tokens = http.post().uri(TOKEN_ENDPOINT).contentType(MediaType.APPLICATION_FORM_URLENCODED)
                    .body(form).retrieve().body(JsonNode.class);
            if (tokens == null || !tokens.hasNonNull("id_token")) {
                return callbackPage(false, "OpenAI did not return a verifiable identity token. No connection was saved.");
            }

            String idToken = tokens.path("id_token").asText();
            Jwt identity = verifyIdentity(idToken, clientId, attempt.nonce());
            String subject = identity.getSubject();
            Connection priorConnection = connection(attempt.userId());
            if (priorConnection != null && (!priorConnection.clientId().equals(clientId)
                    || !priorConnection.subject().equals(subject))) {
                return callbackPage(false, "This PIOS account is already linked to a different ChatGPT account. Disconnect the existing connection before linking another account.");
            }

            String email = identity.getClaimAsString("email");
            String name = identity.getClaimAsString("name");
            String picture = identity.getClaimAsString("picture");
            String scopesValue = tokens.path("scope").asText("");
            Set<String> scopes = parseScopes(scopesValue);
            String accessToken = textOrNull(tokens, "access_token");
            String refreshToken = textOrNull(tokens, "refresh_token");
            boolean planEnabled = scopes.contains(REQUIRED_PLAN_SCOPE)
                    && scopes.contains(REQUIRED_RESOURCE_SCOPE) && accessToken != null;
            long expiresIn = tokens.path("expires_in").asLong(3600);
            Instant expiresAt = Instant.now().plusSeconds(Math.max(60, expiresIn));

            jdbc.update("""
                    INSERT INTO ai_chatgpt_pending_connections
                        (state_hash,user_id,openai_client_id,openai_subject,email,display_name,picture_url,
                         encrypted_id_token,encrypted_access_token,encrypted_refresh_token,granted_scopes,
                         plan_usage_enabled,token_expires_at,expires_at)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                    """,
                    stateHash, attempt.userId(), clientId, subject, email, name, picture,
                    encryption.encrypt(idToken), planEnabled ? encryption.encrypt(accessToken) : null,
                    planEnabled && refreshToken != null ? encryption.encrypt(refreshToken) : null,
                    String.join(" ", scopes), planEnabled, planEnabled ? expiresAt : null,
                    Instant.now().plusSeconds(600));

            return callbackPage(true,
                    "ChatGPT authorisation is complete. Return to the PIOS tab to confirm linking this account.",
                    state);
        } catch (RestClientResponseException ex) {
            return callbackPage(false, safeTokenError(ex));
        } catch (Exception ex) {
            return callbackPage(false, "PIOS could not verify or complete the ChatGPT sign-in. No connection was activated. Return to PIOS and try again.");
        }
    }

    @Transactional
    public ConnectionStatus confirmConnection(UUID userId, String state) {
        if (state == null || !state.matches("[A-Za-z0-9_-]{40,100}")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The ChatGPT sign-in confirmation is invalid. Start again from PIOS.");
        }
        String stateHash = hex(sha256(state.getBytes(StandardCharsets.US_ASCII)));
        List<PendingConnection> pending = jdbc.query("""
                DELETE FROM ai_chatgpt_pending_connections
                WHERE state_hash=? AND user_id=? AND expires_at > now()
                RETURNING openai_client_id,openai_subject,email,display_name,picture_url,
                          encrypted_id_token,encrypted_access_token,encrypted_refresh_token,
                          granted_scopes,plan_usage_enabled,token_expires_at
                """,
                (rs, row) -> new PendingConnection(rs.getString("openai_client_id"),rs.getString("openai_subject"),
                        rs.getString("email"),rs.getString("display_name"),rs.getString("picture_url"),
                        rs.getString("encrypted_id_token"),rs.getString("encrypted_access_token"),
                        rs.getString("encrypted_refresh_token"),rs.getString("granted_scopes"),
                        rs.getBoolean("plan_usage_enabled"),
                        rs.getTimestamp("token_expires_at") == null ? null : rs.getTimestamp("token_expires_at").toInstant()),
                stateHash, userId);
        if (pending.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.GONE, "The ChatGPT sign-in confirmation expired or was already used. Start again.");
        }
        PendingConnection account = pending.get(0);
        Registration savedRegistration = registration(userId);
        if (savedRegistration != null && !savedRegistration.clientId().equals(account.clientId())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This ChatGPT account does not match the saved PIOS registration.");
        }
        Connection priorConnection = connection(userId);
        if (priorConnection != null && (!priorConnection.clientId().equals(account.clientId())
                || !priorConnection.subject().equals(account.subject()))) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This PIOS account is already linked to a different ChatGPT account.");
        }

        if (savedRegistration == null) {
            jdbc.update("""
                    INSERT INTO ai_chatgpt_registrations(user_id,client_id,ext_agent_host_id,created_at,updated_at)
                    VALUES (?,?,?,?,now())
                    """, userId, account.clientId(), hostId(), Instant.now());
        }
        jdbc.update("""
                INSERT INTO ai_chatgpt_connections
                    (id,user_id,openai_client_id,openai_subject,email,display_name,picture_url,
                     encrypted_id_token,encrypted_access_token,encrypted_refresh_token,granted_scopes,
                     plan_usage_enabled,token_expires_at,connected_at,updated_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,now(),now())
                ON CONFLICT(user_id) DO UPDATE SET
                    openai_client_id=EXCLUDED.openai_client_id,openai_subject=EXCLUDED.openai_subject,
                    email=EXCLUDED.email,display_name=EXCLUDED.display_name,picture_url=EXCLUDED.picture_url,
                    encrypted_id_token=EXCLUDED.encrypted_id_token,
                    encrypted_access_token=EXCLUDED.encrypted_access_token,
                    encrypted_refresh_token=EXCLUDED.encrypted_refresh_token,
                    granted_scopes=EXCLUDED.granted_scopes,plan_usage_enabled=EXCLUDED.plan_usage_enabled,
                    token_expires_at=EXCLUDED.token_expires_at,connected_at=EXCLUDED.connected_at,updated_at=now()
                """,
                UUID.randomUUID(), userId, account.clientId(), account.subject(), account.email(), account.displayName(), account.pictureUrl(),
                account.encryptedIdToken(), account.encryptedAccessToken(), account.encryptedRefreshToken(),
                account.grantedScopes(), account.planUsageEnabled(), account.tokenExpiresAt());

        if (!account.planUsageEnabled()) removeChatGptProvider(userId);
        return status(userId);
    }

    public ConnectionStatus status(UUID userId) {
        Connection connection = connection(userId);
        if (connection == null) return new ConnectionStatus(false, false, null, null, null, null, null);
        String model = jdbc.query("SELECT model_name FROM ai_provider_connections WHERE user_id=? AND provider_type=?",
                rs -> rs.next() ? rs.getString(1) : null, userId, PROVIDER_TYPE);
        return new ConnectionStatus(true, connection.planUsageEnabled(), connection.email(), connection.displayName(),
                connection.connectedAt(), model, "https://chatgpt.com/settings/usage");
    }

    public List<ChatGptModel> models(UUID userId) {
        String token = validAccessToken(userId);
        JsonNode response;
        try {
            response = http.get().uri(RESOURCE + "/models").headers(h -> h.setBearerAuth(token)).retrieve().body(JsonNode.class);
        } catch (RestClientResponseException ex) {
            throw providerFailure(ex);
        }
        List<ChatGptModel> models = new ArrayList<>();
        JsonNode entries = response == null ? null : response.path("models");
        if (entries != null && entries.isArray()) {
            for (JsonNode entry : entries) {
                if (!"list".equals(entry.path("visibility").asText())) continue;
                String slug = entry.path("slug").asText("");
                if (slug.isBlank()) continue;
                models.add(new ChatGptModel(slug, entry.path("display_name").asText(slug)));
            }
        }
        return models;
    }

    @Transactional
    public void activateModel(UUID userId, String modelName, boolean makeDefault) {
        if (modelName == null || modelName.isBlank()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Select a model from the ChatGPT model list.");
        boolean found = models(userId).stream().anyMatch(model -> model.slug().equals(modelName));
        if (!found) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "That model is not available to this ChatGPT account. Refresh the model list.");
        Boolean hasDefault = jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM ai_provider_connections WHERE user_id=? AND is_default=true)", Boolean.class, userId);
        boolean isDefault = makeDefault || !Boolean.TRUE.equals(hasDefault);
        if (isDefault) jdbc.update("UPDATE ai_provider_connections SET is_default=false,updated_at=now() WHERE user_id=?", userId);
        UUID id = jdbc.query("SELECT id FROM ai_provider_connections WHERE user_id=? AND provider_type=?",
                rs -> rs.next() ? rs.getObject(1, UUID.class) : null, userId, PROVIDER_TYPE);
        if (id == null) {
            id = UUID.randomUUID();
            jdbc.update("""
                    INSERT INTO ai_provider_connections(id,user_id,display_name,provider_type,model_name,base_url,encrypted_api_key,is_default)
                    VALUES (?,?,?,?,?,?,NULL,?)
                    """, id, userId, "ChatGPT plan", PROVIDER_TYPE, modelName, RESOURCE, isDefault);
        } else {
            jdbc.update("UPDATE ai_provider_connections SET model_name=?,is_default=?,updated_at=now() WHERE id=? AND user_id=?",
                    modelName, isDefault, id, userId);
        }
    }

    @Transactional
    public DisconnectResult disconnect(UUID userId) {
        Connection connection = connection(userId);
        boolean remoteRevocationConfirmed = false;
        if (connection != null && connection.encryptedRefreshToken() != null && !connection.encryptedRefreshToken().isBlank()) {
            MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
            form.add("token", encryption.decrypt(connection.encryptedRefreshToken()));
            form.add("token_type_hint", "refresh_token");
            form.add("client_id", connection.clientId());
            try {
                http.post().uri(REVOCATION_ENDPOINT).contentType(MediaType.APPLICATION_FORM_URLENCODED)
                        .body(form).retrieve().toBodilessEntity();
                remoteRevocationConfirmed = true;
            } catch (Exception ignored) {
                // Local tokens are still deleted. The UI tells the user when remote revocation was not confirmed.
            }
        }
        Boolean wasDefault = jdbc.query("""
                SELECT is_default FROM ai_provider_connections WHERE user_id=? AND provider_type=?
                """, rs -> rs.next() && rs.getBoolean(1), userId, PROVIDER_TYPE);
        jdbc.update("DELETE FROM ai_provider_connections WHERE user_id=? AND provider_type=?", userId, PROVIDER_TYPE);
        jdbc.update("DELETE FROM ai_chatgpt_connections WHERE user_id=?", userId);
        if (Boolean.TRUE.equals(wasDefault)) {
            jdbc.update("""
                    UPDATE ai_provider_connections SET is_default=true
                    WHERE id=(SELECT id FROM ai_provider_connections WHERE user_id=? ORDER BY created_at DESC LIMIT 1)
                    """, userId);
        }
        // Keep the issued client registration so this ChatGPT agent can be reauthorised.
        return new DisconnectResult(remoteRevocationConfirmed);
    }

    public String complete(UUID userId, String model, String instructions, String prompt) {
        String accessToken = validAccessToken(userId);
        if (model == null || model.isBlank()) throw new AiProviderException("Choose a ChatGPT model in AI providers before using this connection.");
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("model", model);
        body.put("instructions", instructions);
        body.put("input", List.of(Map.of("role", "user", "content", prompt)));
        body.put("store", false);
        body.put("stream", true);
        try {
            return http.post().uri(RESOURCE + "/responses")
                    .contentType(MediaType.APPLICATION_JSON)
                    .accept(MediaType.TEXT_EVENT_STREAM)
                    .headers(headers -> headers.setBearerAuth(accessToken))
                    .body(body)
                    .exchange((request, response) -> readResponseStream(response));
        } catch (RestClientResponseException ex) {
            throw providerFailure(ex);
        }
    }

    private String validAccessToken(UUID userId) {
        synchronized (refreshLock(userId)) {
            Connection connection = connection(userId);
            if (connection == null) throw new AiProviderException("Connect your ChatGPT account in AI providers first.");
            if (!connection.planUsageEnabled()) throw new AiProviderException("This ChatGPT connection has sign-in only. Reconnect and authorise ChatGPT plan usage.");
            if (connection.encryptedAccessToken() == null) throw new AiProviderException("The ChatGPT access token is unavailable. Reconnect your account.");
            if (connection.tokenExpiresAt() != null && connection.tokenExpiresAt().isAfter(Instant.now().plusSeconds(90))) {
                return encryption.decrypt(connection.encryptedAccessToken());
            }
            if (connection.encryptedRefreshToken() == null) {
                throw new AiProviderException("The ChatGPT session expired. Reconnect your ChatGPT account to continue.");
            }
            MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
            form.add("grant_type", "refresh_token");
            form.add("client_id", connection.clientId());
            form.add("refresh_token", encryption.decrypt(connection.encryptedRefreshToken()));
            form.add("resource", RESOURCE);
            JsonNode tokens;
            try {
                tokens = http.post().uri(TOKEN_ENDPOINT).contentType(MediaType.APPLICATION_FORM_URLENCODED)
                        .body(form).retrieve().body(JsonNode.class);
            } catch (RestClientResponseException ex) {
                if (ex.getStatusCode().value() == 400 || ex.getStatusCode().value() == 401) {
                    throw new AiProviderException("The ChatGPT connection expired or was revoked. Reconnect your account in AI providers.");
                }
                throw providerFailure(ex);
            }
            String access = textOrNull(tokens, "access_token");
            if (access == null) throw new AiProviderException("OpenAI did not return a refreshed access token. Reconnect your account.");
            String refresh = textOrNull(tokens, "refresh_token");
            if (refresh == null) refresh = encryption.decrypt(connection.encryptedRefreshToken());
            String scope = textOrNull(tokens, "scope");
            if (scope == null) scope = connection.grantedScopes();
            boolean planEnabled = parseScopes(scope).contains(REQUIRED_PLAN_SCOPE) && parseScopes(scope).contains(REQUIRED_RESOURCE_SCOPE);
            if (!planEnabled) throw new AiProviderException("The refreshed ChatGPT grant no longer includes plan usage. Reconnect and review the permission.");
            long expiresIn = tokens.path("expires_in").asLong(3600);
            jdbc.update("""
                    UPDATE ai_chatgpt_connections
                    SET encrypted_access_token=?,encrypted_refresh_token=?,granted_scopes=?,
                        token_expires_at=?,updated_at=now()
                    WHERE user_id=?
                    """, encryption.encrypt(access), encryption.encrypt(refresh), scope,
                    Instant.now().plusSeconds(Math.max(60, expiresIn)), userId);
            return access;
        }
    }

    private String readResponseStream(ClientHttpResponse response) throws java.io.IOException {
        if (!response.getStatusCode().is2xxSuccessful()) {
            byte[] body = response.getBody().readAllBytes();
            throw new AiProviderException(responseError(new String(body, StandardCharsets.UTF_8), response.getStatusCode()));
        }
        StringBuilder answer = new StringBuilder();
        StringBuilder data = new StringBuilder();
        boolean completed = false;
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(response.getBody(), StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.isEmpty()) {
                    if (data.length() > 0) {
                        JsonNode event = mapper.readTree(data.toString());
                        String type = event.path("type").asText("");
                        if ("response.output_text.delta".equals(type)) answer.append(event.path("delta").asText(""));
                        if ("response.failed".equals(type)) {
                            JsonNode failure = event.path("response").path("error");
                            if (failure.isMissingNode()) failure = event.path("error");
                            throw new AiProviderException(responseError(failure.toString(), response.getStatusCode()));
                        }
                        if ("response.incomplete".equals(type)) throw new AiProviderException("The ChatGPT response was incomplete. Try a shorter request or another model.");
                        if ("response.completed".equals(type)) completed = true;
                        data.setLength(0);
                    }
                } else if (line.startsWith("data:")) {
                    if (data.length() > 0) data.append('\n');
                    data.append(line.substring(5).trim());
                }
            }
        }
        if (!completed) throw new AiProviderException("The ChatGPT response stream ended before response.completed. The request may not have completed.");
        if (answer.isEmpty()) throw new AiProviderException("The selected ChatGPT model returned no text.");
        return answer.toString();
    }

    private String responseError(String raw, HttpStatusCode status) {
        String code = "unknown_error";
        String detail = null;
        String parameter = null;
        try {
            JsonNode node = mapper.readTree(raw);
            if (node.hasNonNull("detail")) detail = node.path("detail").asText();
            if (node.has("error")) node = node.path("error");
            code = node.path("code").asText(code);
            parameter = node.path("param").asText(null);
            if (detail == null && node.hasNonNull("message")) detail = node.path("message").asText();
        } catch (Exception ignored) { }
        return switch (code) {
            case "subscription_sharing_user_not_eligible" -> "This ChatGPT account or workspace is not eligible to use its plan in PIOS.";
            case "subscription_sharing_usage_limit_exceeded" -> "Your ChatGPT app usage limit has been reached. Pause ChatGPT-plan requests and review ChatGPT Settings > Usage.";
            case "subscription_sharing_usage_unavailable" -> "ChatGPT plan usage is temporarily unavailable. Preserve this connection and retry later; your API-key and local-model connections remain available.";
            case "subscription_sharing_unsupported_capability" -> "This ChatGPT-plan connection does not support the requested capability" + (parameter == null ? "." : " (" + parameter + "). Remove that capability and retry.");
            case "subscription_sharing_route_not_supported" -> "This route is not supported for ChatGPT plan usage. PIOS must use POST /v1/responses.";
            case "subscription_sharing_invalid_user" -> "OpenAI could not validate the connected ChatGPT identity. Reconnect the ChatGPT account.";
            case "subscription_sharing_user_unavailable" -> "ChatGPT account or workspace data is temporarily unavailable. Retry later.";
            case "chatpass_v2_scope_not_authorized", "chatpass_v2_invalid_authorization_context" -> "The ChatGPT grant does not authorize this request. Reconnect and review the requested permissions.";
            default -> {
                if (detail != null && !detail.isBlank()) yield "ChatGPT plan request was rejected (HTTP " + status.value() + "): " + detail;
                if (status.value() == 401) yield "ChatGPT rejected the plan-usage credential. Reconnect the ChatGPT account.";
                if (status.value() == 403) yield "ChatGPT blocked plan usage for this account, workspace, or region.";
                if (status.value() == 503) yield "ChatGPT plan routing is temporarily unavailable. Retry later.";
                yield "ChatGPT Responses API returned HTTP " + status.value() + " (" + code + ").";
            }
        };
    }

    private RuntimeException providerFailure(RestClientResponseException ex) {
        return new AiProviderException(responseError(ex.getResponseBodyAsString(), ex.getStatusCode()));
    }

    private Jwt verifyIdentity(String idToken, String clientId, String expectedNonce) {
        try {
            NimbusJwtDecoder decoder = NimbusJwtDecoder.withJwkSetUri(JWKS_URI).build();
            OAuth2TokenValidator<Jwt> audienceValidator = jwt -> jwt.getAudience().contains(clientId)
                    ? OAuth2TokenValidatorResult.success()
                    : OAuth2TokenValidatorResult.failure(new OAuth2Error("invalid_token", "Invalid ChatGPT token audience.", null));
            decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(
                    JwtValidators.createDefaultWithIssuer(ISSUER), audienceValidator));
            Jwt jwt = decoder.decode(idToken);
            if (expectedNonce == null || !expectedNonce.equals(jwt.getClaimAsString("nonce"))) {
                throw new IllegalArgumentException("OIDC nonce did not match.");
            }
            if (jwt.getSubject() == null || jwt.getSubject().isBlank()) throw new IllegalArgumentException("OIDC subject missing.");
            return jwt;
        } catch (JwtException ex) {
            throw new IllegalArgumentException("ChatGPT identity token validation failed.", ex);
        }
    }

    private void removeChatGptProvider(UUID userId) {
        Boolean wasDefault = jdbc.query("""
                SELECT is_default FROM ai_provider_connections WHERE user_id=? AND provider_type=?
                """, rs -> rs.next() && rs.getBoolean(1), userId, PROVIDER_TYPE);
        jdbc.update("DELETE FROM ai_provider_connections WHERE user_id=? AND provider_type=?", userId, PROVIDER_TYPE);
        if (Boolean.TRUE.equals(wasDefault)) {
            jdbc.update("""
                    UPDATE ai_provider_connections SET is_default=true
                    WHERE id=(SELECT id FROM ai_provider_connections WHERE user_id=? ORDER BY created_at DESC LIMIT 1)
                    """, userId);
        }
    }

    private Registration registration(UUID userId) {
        return jdbc.query("SELECT client_id,ext_agent_host_id FROM ai_chatgpt_registrations WHERE user_id=?",
                rs -> rs.next() ? new Registration(rs.getString("client_id"), rs.getString("ext_agent_host_id")) : null, userId);
    }

    private Connection connection(UUID userId) {
        return jdbc.query("""
                SELECT openai_client_id,openai_subject,email,display_name,picture_url,encrypted_id_token,
                       encrypted_access_token,encrypted_refresh_token,granted_scopes,plan_usage_enabled,
                       token_expires_at,connected_at
                FROM ai_chatgpt_connections WHERE user_id=?
                """, rs -> rs.next() ? new Connection(rs.getString("openai_client_id"), rs.getString("openai_subject"), rs.getString("email"),
                rs.getString("display_name"), rs.getString("picture_url"), rs.getString("encrypted_id_token"),
                rs.getString("encrypted_access_token"), rs.getString("encrypted_refresh_token"),
                rs.getString("granted_scopes"), rs.getBoolean("plan_usage_enabled"),
                rs.getTimestamp("token_expires_at") == null ? null : rs.getTimestamp("token_expires_at").toInstant(),
                rs.getTimestamp("connected_at") == null ? null : rs.getTimestamp("connected_at").toInstant()) : null, userId);
    }

    private String hostId() {
        String existing = jdbc.query("SELECT setting_value FROM pios_runtime_settings WHERE setting_key='chatgpt.ext_agent_host_id'",
                rs -> rs.next() ? rs.getString(1) : null);
        if (existing != null && !existing.isBlank()) return existing;
        String candidate = "urn:uuid:" + UUID.randomUUID();
        jdbc.update("""
                INSERT INTO pios_runtime_settings(setting_key,setting_value)
                VALUES ('chatgpt.ext_agent_host_id',?)
                ON CONFLICT(setting_key) DO NOTHING
                """, candidate);
        return jdbc.queryForObject("SELECT setting_value FROM pios_runtime_settings WHERE setting_key='chatgpt.ext_agent_host_id'", String.class);
    }

    private void validateLoopbackRedirect() {
        try {
            URI uri = URI.create(redirectUri);
            if (!"http".equalsIgnoreCase(uri.getScheme()) || !"127.0.0.1".equals(uri.getHost())
                    || uri.getPort() < 1 || !"/auth/callback".equals(uri.getPath())
                    || uri.getRawQuery() != null || uri.getUserInfo() != null) {
                throw new IllegalStateException("ChatGPT OAuth must use http://127.0.0.1:<port>/auth/callback. Only the loopback port may vary.");
            }
        } catch (IllegalArgumentException ex) {
            throw new IllegalStateException("Invalid ChatGPT OAuth callback configuration.", ex);
        }
    }

    private Object refreshLock(UUID userId) { return refreshLocks.computeIfAbsent(userId, ignored -> new Object()); }
    private final java.util.concurrent.ConcurrentHashMap<UUID, Object> refreshLocks = new java.util.concurrent.ConcurrentHashMap<>();

    private static Set<String> parseScopes(String value) {
        Set<String> scopes = new HashSet<>();
        if (value != null) for (String scope : value.trim().split("\\s+")) if (!scope.isBlank()) scopes.add(scope);
        return scopes;
    }

    private static String textOrNull(JsonNode node, String field) {
        return node != null && node.hasNonNull(field) && !node.path(field).asText().isBlank() ? node.path(field).asText() : null;
    }

    private static String randomValue(int bytes) {
        byte[] value = new byte[bytes];
        RANDOM.nextBytes(value);
        return base64Url(value);
    }

    private static String base64Url(byte[] value) { return Base64.getUrlEncoder().withoutPadding().encodeToString(value); }
    private static byte[] sha256(byte[] value) {
        try { return MessageDigest.getInstance("SHA-256").digest(value); }
        catch (Exception ex) { throw new IllegalStateException("SHA-256 is unavailable.", ex); }
    }
    private static String hex(byte[] value) {
        StringBuilder result = new StringBuilder(value.length * 2);
        for (byte b : value) result.append(String.format("%02x", b));
        return result.toString();
    }

    private static String callbackPage(boolean success, String message) {
        return callbackPage(success, message, null);
    }

    private static String callbackPage(boolean success, String message, String state) {
        String color = success ? "#20744d" : "#a33b32";
        String title = success ? "PIOS connection ready to confirm" : "PIOS could not connect";
        String safeMessage = message.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
        String safeJsMessage = message.replace("\\", "\\\\").replace("'", "\\'").replace("\r", "").replace("\n", " ");
        String statePayload = state != null && state.matches("[A-Za-z0-9_-]{40,100}") ? "'" + state + "'" : "null";
        String eventPayload = "{type:'pios-chatgpt-oauth',success:" + success
                + ",state:" + statePayload + ",message:'" + safeJsMessage + "'}";
        return "<!doctype html><html><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>"
                + title + "</title></head><body style=\"font:16px system-ui;background:#f6f8f6;color:#25352b;display:grid;place-items:center;min-height:100vh;margin:0\"><main style=\"max-width:520px;margin:24px;padding:30px;border:1px solid #dce6de;border-radius:16px;background:white\"><h1 style=\"font-size:22px;color:"
                + color + "\">" + title + "</h1><p style=\"line-height:1.6\">" + safeMessage + "</p><p>Return to the PIOS tab to finish linking. You may close this tab after it updates.</p><a href=\"http://localhost:3000\" style=\"color:#28724f\">Return to PIOS</a><script>if(window.opener){window.opener.postMessage("
                + eventPayload + ",'http://localhost:3000');setTimeout(()=>window.close(),800)}</script></main></body></html>";
    }

    private String safeTokenError(RestClientResponseException ex) {
        return "OpenAI token exchange failed (HTTP " + ex.getStatusCode().value() + "). Return to PIOS and start a new sign-in; no API key is required.";
    }

    public record ConnectStart(String launchUrl, String redirectUri) { }
    public record ConnectionStatus(boolean connected, boolean planUsageEnabled, String email, String displayName,
                                   Instant connectedAt, String selectedModel, String manageUsageUrl) { }
    public record ChatGptModel(String slug, String displayName) { }
    public record DisconnectResult(boolean remoteRevocationConfirmed) { }
    private record Registration(String clientId, String hostId) { }
    private record PendingConnection(String clientId, String subject, String email, String displayName, String pictureUrl,
                                     String encryptedIdToken, String encryptedAccessToken, String encryptedRefreshToken,
                                     String grantedScopes, boolean planUsageEnabled, Instant tokenExpiresAt) { }
    private record PendingAttempt(UUID userId, String nonce, String encryptedVerifier, String redirectUri,
                                  String clientId, String hostId) { }
    private record Connection(String clientId, String subject, String email, String displayName, String pictureUrl,
                              String encryptedIdToken, String encryptedAccessToken, String encryptedRefreshToken,
                              String grantedScopes, boolean planUsageEnabled, Instant tokenExpiresAt, Instant connectedAt) { }

    public static class AiProviderException extends RuntimeException {
        public AiProviderException(String message) { super(message); }
    }
}

package com.pios.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.Map;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

@Service
public class AiGatewayService {
    private final ObjectMapper mapper;
    private final SecretEncryptionService encryption;

    public AiGatewayService(ObjectMapper mapper, SecretEncryptionService encryption) {
        this.mapper = mapper;
        this.encryption = encryption;
    }

    public String complete(ProviderConfig provider, String systemPrompt, String userPrompt) {
        String key = encryption.decrypt(provider.encryptedApiKey());
        try {
            return switch (provider.providerType().toUpperCase()) {
                case "ANTHROPIC" -> anthropic(provider, key, systemPrompt, userPrompt);
                case "GEMINI" -> gemini(provider, key, systemPrompt, userPrompt);
                default -> openAiCompatible(provider, key, systemPrompt, userPrompt);
            };
        } catch (RestClientResponseException ex) {
            String message = "The AI provider returned HTTP " + ex.getStatusCode().value() + ". Check the provider key, model and endpoint.";
            throw new AiProviderException(message);
        } catch (AiProviderException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new AiProviderException("Could not contact the configured AI provider. Check its endpoint, network access and model name.");
        }
    }

    private String openAiCompatible(ProviderConfig provider, String key, String systemPrompt, String userPrompt) throws Exception {
        String baseUrl = normalizeBaseUrl(provider.baseUrl());
        RestClient client = RestClient.builder().baseUrl(baseUrl).build();
        Map<String, Object> body = Map.of(
                "model", provider.modelName(),
                "temperature", 0.2,
                "messages", List.of(
                        Map.of("role", "system", "content", systemPrompt),
                        Map.of("role", "user", "content", userPrompt)));
        RestClient.RequestBodySpec request = client.post().uri("/chat/completions").contentType(MediaType.APPLICATION_JSON);
        if (key != null && !key.isBlank()) request.header("Authorization", "Bearer " + key);
        String raw = request.body(body).retrieve().body(String.class);
        JsonNode json = mapper.readTree(raw);
        String answer = json.path("choices").path(0).path("message").path("content").asText("");
        if (answer.isBlank()) throw new AiProviderException("The configured model returned an empty response.");
        return answer;
    }

    private String anthropic(ProviderConfig provider, String key, String systemPrompt, String userPrompt) throws Exception {
        if (key == null || key.isBlank()) throw new AiProviderException("Anthropic requires an API key.");
        RestClient client = RestClient.builder().baseUrl("https://api.anthropic.com").build();
        Map<String, Object> body = Map.of(
                "model", provider.modelName(), "max_tokens", 1800,
                "system", systemPrompt,
                "messages", List.of(Map.of("role", "user", "content", userPrompt)));
        String raw = client.post().uri("/v1/messages").contentType(MediaType.APPLICATION_JSON)
                .header("x-api-key", key).header("anthropic-version", "2023-06-01")
                .body(body).retrieve().body(String.class);
        JsonNode content = mapper.readTree(raw).path("content");
        StringBuilder answer = new StringBuilder();
        if (content.isArray()) content.forEach(item -> { if (item.path("type").asText().equals("text")) answer.append(item.path("text").asText()); });
        if (answer.isEmpty()) throw new AiProviderException("Anthropic returned an empty response.");
        return answer.toString();
    }

    private String gemini(ProviderConfig provider, String key, String systemPrompt, String userPrompt) throws Exception {
        if (key == null || key.isBlank()) throw new AiProviderException("Gemini requires an API key.");
        String model = provider.modelName().startsWith("models/") ? provider.modelName().substring(7) : provider.modelName();
        RestClient client = RestClient.builder().baseUrl("https://generativelanguage.googleapis.com").build();
        Map<String, Object> body = Map.of(
                "systemInstruction", Map.of("parts", List.of(Map.of("text", systemPrompt))),
                "contents", List.of(Map.of("role", "user", "parts", List.of(Map.of("text", userPrompt)))),
                "generationConfig", Map.of("temperature", 0.2, "maxOutputTokens", 1800));
        String raw = client.post().uri(uri -> uri.path("/v1beta/models/{model}:generateContent").build(model))
                .header("x-goog-api-key", key).contentType(MediaType.APPLICATION_JSON).body(body).retrieve().body(String.class);
        JsonNode parts = mapper.readTree(raw).path("candidates").path(0).path("content").path("parts");
        StringBuilder answer = new StringBuilder();
        if (parts.isArray()) parts.forEach(part -> answer.append(part.path("text").asText("")));
        if (answer.isEmpty()) throw new AiProviderException("Gemini returned an empty response.");
        return answer.toString();
    }

    private String normalizeBaseUrl(String value) {
        String url = (value == null || value.isBlank()) ? "https://api.openai.com/v1" : value.trim();
        while (url.endsWith("/")) url = url.substring(0, url.length() - 1);
        return url;
    }

    public record ProviderConfig(String providerType, String modelName, String baseUrl, String encryptedApiKey) { }

    public static class AiProviderException extends RuntimeException {
        public AiProviderException(String message) { super(message); }
    }
}

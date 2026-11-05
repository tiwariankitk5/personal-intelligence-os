package com.pios.ai;

import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;
import static org.junit.jupiter.api.Assertions.*;

class ProviderEndpointPolicyTest {
    private final ProviderEndpointPolicy hosted = new ProviderEndpointPolicy(false, "api.openai.com,openrouter.ai");
    @Test void acceptsApprovedHttpsEndpoints() {
        assertEquals("https://api.openai.com/v1", hosted.validate(null));
        assertEquals("https://openrouter.ai/api/v1", hosted.validate("https://openrouter.ai/api/v1/"));
    }
    @Test void rejectsInternalAndDisguisedDestinations() {
        for (String url : new String[]{"http://127.0.0.1:11434/v1", "https://169.254.169.254", "https://10.0.0.1", "https://api.openai.com.evil.example", "https://api.openai.com@evil.example", "https://evil.example/localhost", "https://api.openai.com:8443/v1", "https://api.openai.com/v1?redirect=evil", "file:///etc/passwd"})
            assertThrows(ResponseStatusException.class, () -> hosted.validate(url), url);
    }
    @Test void selfHostedModeAllowsOnlyExplicitLocalModelPorts() {
        var local = new ProviderEndpointPolicy(true, "api.openai.com");
        assertEquals("http://host.docker.internal:11434/v1", local.validate("http://host.docker.internal:11434/v1"));
        assertThrows(ResponseStatusException.class, () -> local.validate("http://localhost:8080"));
        assertFalse(local.isLocal("https://api.openai.com/localhost"));
    }
}

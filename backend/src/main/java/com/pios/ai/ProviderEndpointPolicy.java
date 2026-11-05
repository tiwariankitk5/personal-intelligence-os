package com.pios.ai;

import java.net.URI;
import java.util.Arrays;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

/** Hosted deployments only contact operator-approved cloud hosts, never arbitrary user URLs. */
@Component
public class ProviderEndpointPolicy {
    private final boolean localEnabled;
    private final Set<String> cloudHosts;
    public ProviderEndpointPolicy(@Value("${app.ai.allow-local-endpoints:false}") boolean localEnabled,
            @Value("${app.ai.allowed-cloud-hosts:api.openai.com,openrouter.ai,api.groq.com,api.deepseek.com,api.mistral.ai}") String cloudHosts) {
        this.localEnabled = localEnabled;
        this.cloudHosts = Arrays.stream(cloudHosts.split(",")).map(String::trim).map(value -> value.toLowerCase(Locale.ROOT)).filter(value -> !value.isBlank()).collect(Collectors.toUnmodifiableSet());
    }
    public String validate(String value) {
        String url = value == null || value.isBlank() ? "https://api.openai.com/v1" : value.trim();
        try {
            URI uri = URI.create(url);
            if (uri.getHost() == null || uri.getRawUserInfo() != null || uri.getRawQuery() != null || uri.getRawFragment() != null) throw new IllegalArgumentException();
            String host = uri.getHost().toLowerCase(Locale.ROOT);
            boolean local = Set.of("localhost", "127.0.0.1", "host.docker.internal").contains(host);
            if (local) {
                if (!localEnabled || !"http".equalsIgnoreCase(uri.getScheme()) || !Set.of(11434, 1234).contains(uri.getPort())) throw new IllegalArgumentException();
            } else if (!"https".equalsIgnoreCase(uri.getScheme()) || !cloudHosts.contains(host) || (uri.getPort() != -1 && uri.getPort() != 443)) throw new IllegalArgumentException();
            return url.replaceAll("/+$", "");
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "This provider endpoint is not approved. Choose a supported cloud provider; local models require an explicitly enabled self-hosted deployment.");
        }
    }
    public boolean isLocal(String value) {
        if (value == null) return false;
        String host = URI.create(value).getHost();
        return host != null && Set.of("localhost", "127.0.0.1", "host.docker.internal").contains(host.toLowerCase(Locale.ROOT));
    }
}

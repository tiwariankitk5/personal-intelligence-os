package com.pios.common.config;

import java.net.URI;
import java.util.Base64;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

@Component
@Profile("hosted")
public class HostedConfigurationGuard {
    public HostedConfigurationGuard(@Value("${app.cors.allowed-origins}") String origin,
            @Value("${app.ai.allow-local-endpoints}") boolean localEndpoints,
            @Value("${server.servlet.session.cookie.secure}") boolean secure,
            @Value("${app.jwt.secret-base64}") String jwt,
            @Value("${app.encryption.key-base64}") String encryption) {
        try {
            URI uri = URI.create(origin);
            if (!"https".equals(uri.getScheme()) || uri.getHost() == null || uri.getUserInfo() != null
                    || uri.getQuery() != null || uri.getFragment() != null
                    || (uri.getPath() != null && !uri.getPath().isEmpty())
                    || localEndpoints || !secure || Base64.getDecoder().decode(jwt).length < 32
                    || Base64.getDecoder().decode(encryption).length != 32) throw new IllegalArgumentException();
        } catch (IllegalArgumentException ex) {
            throw new IllegalStateException("Hosted mode requires one HTTPS origin, secure cookies, cloud-only AI endpoints and valid secret keys.");
        }
    }
}

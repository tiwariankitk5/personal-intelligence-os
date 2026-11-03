package com.pios.common.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.jwt")
public record JwtProperties(String secretBase64, long expirationMs) {
    public JwtProperties {
        if (secretBase64 == null || secretBase64.isBlank()) {
            throw new IllegalArgumentException("APP_JWT_SECRET_BASE64 must be configured.");
        }
        if (expirationMs < 60_000) {
            throw new IllegalArgumentException("JWT expiration must be at least 60 seconds.");
        }
    }
}

package com.pios.auth;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.Set;
import java.util.UUID;

public final class AuthDtos {
    private AuthDtos() { }

    public record RegisterRequest(
            @NotBlank @Size(max = 120) String displayName,
            @NotBlank @Email @Size(max = 320) String email,
            @NotBlank @Size(min = 8, max = 72) String password,
            Set<@Size(max = 60) String> roles,
            Set<@Size(max = 100) String> interests,
            Set<@Size(max = 100) String> goals) { }

    public record LoginRequest(
            @NotBlank @Email @Size(max = 320) String email,
            @NotBlank String password) { }

    public record UserSummary(UUID id, String email, String displayName) { }

    public record AuthResponse(String accessToken, String tokenType, long expiresInSeconds, UserSummary user) { }
}

package com.pios.profile;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.Set;
import java.util.UUID;

public final class ProfileDtos {
    private ProfileDtos() { }

    public record UpdateProfileRequest(
            @NotBlank @Size(max = 120) String displayName,
            Set<@Size(max = 60) String> roles,
            Set<@Size(max = 100) String> interests,
            Set<@Size(max = 100) String> goals) { }

    public record ProfileResponse(UUID userId, String email, String displayName,
                                  Set<String> roles, Set<String> interests, Set<String> goals) { }
}

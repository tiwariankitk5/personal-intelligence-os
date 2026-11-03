package com.pios.profile;

import com.pios.auth.UserPrincipal;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/profile/me")
public class ProfileController {
    private final ProfileService profileService;

    public ProfileController(ProfileService profileService) {
        this.profileService = profileService;
    }

    @GetMapping
    public ProfileDtos.ProfileResponse get(@AuthenticationPrincipal UserPrincipal principal) {
        return profileService.get(principal.id());
    }

    @PutMapping
    public ProfileDtos.ProfileResponse update(@AuthenticationPrincipal UserPrincipal principal,
                                              @Valid @RequestBody ProfileDtos.UpdateProfileRequest request) {
        return profileService.update(principal.id(), request);
    }
}

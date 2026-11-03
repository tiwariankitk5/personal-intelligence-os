package com.pios.profile;

import com.pios.common.error.ResourceNotFoundException;
import com.pios.user.AppUser;
import com.pios.user.AppUserRepository;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ProfileService {
    private final AppUserRepository userRepository;
    private final UserProfileRepository profileRepository;

    public ProfileService(AppUserRepository userRepository, UserProfileRepository profileRepository) {
        this.userRepository = userRepository;
        this.profileRepository = profileRepository;
    }

    @Transactional(readOnly = true)
    public ProfileDtos.ProfileResponse get(UUID userId) {
        AppUser user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("Profile not found."));
        UserProfile profile = profileRepository.findByUser_Id(userId)
                .orElseThrow(() -> new ResourceNotFoundException("Profile not found."));
        return toResponse(user, profile);
    }

    @Transactional
    public ProfileDtos.ProfileResponse update(UUID userId, ProfileDtos.UpdateProfileRequest request) {
        AppUser user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("Profile not found."));
        UserProfile profile = profileRepository.findByUser_Id(userId)
                .orElseThrow(() -> new ResourceNotFoundException("Profile not found."));
        user.changeDisplayName(request.displayName().trim());
        profile.update(safeSet(request.roles()), safeSet(request.interests()), safeSet(request.goals()));
        return toResponse(user, profile);
    }

    private ProfileDtos.ProfileResponse toResponse(AppUser user, UserProfile profile) {
        return new ProfileDtos.ProfileResponse(user.getId(), user.getEmail(), user.getDisplayName(),
                profile.getRoles(), profile.getInterests(), profile.getGoals());
    }

    private Set<String> safeSet(Set<String> values) {
        if (values == null) return Set.of();
        return values.stream().filter(value -> value != null && !value.isBlank())
                .map(String::trim).collect(java.util.stream.Collectors.toUnmodifiableSet());
    }
}

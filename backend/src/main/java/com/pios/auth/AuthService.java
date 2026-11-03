package com.pios.auth;

import com.pios.common.error.EmailAlreadyRegisteredException;
import com.pios.profile.UserProfile;
import com.pios.profile.UserProfileRepository;
import com.pios.user.AppUser;
import com.pios.user.AppUserRepository;
import com.pios.workspace.Workspace;
import com.pios.workspace.WorkspaceRepository;
import com.pios.workspace.WorkspaceType;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.Set;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {
    private final AppUserRepository userRepository;
    private final UserProfileRepository profileRepository;
    private final WorkspaceRepository workspaceRepository;
    private final PasswordEncoder passwordEncoder;
    private final AuthenticationManager authenticationManager;
    private final JwtService jwtService;

    public AuthService(AppUserRepository userRepository,
                       UserProfileRepository profileRepository,
                       WorkspaceRepository workspaceRepository,
                       PasswordEncoder passwordEncoder,
                       AuthenticationManager authenticationManager,
                       JwtService jwtService) {
        this.userRepository = userRepository;
        this.profileRepository = profileRepository;
        this.workspaceRepository = workspaceRepository;
        this.passwordEncoder = passwordEncoder;
        this.authenticationManager = authenticationManager;
        this.jwtService = jwtService;
    }

    @Transactional
    public AuthDtos.AuthResponse register(AuthDtos.RegisterRequest request) {
        String email = request.email().trim().toLowerCase(Locale.ROOT);
        String displayName = request.displayName().trim();
        if (request.password().getBytes(StandardCharsets.UTF_8).length > 72) {
            throw new IllegalArgumentException("Password must not exceed 72 UTF-8 bytes.");
        }
        if (userRepository.existsByEmailIgnoreCase(email)) {
            throw new EmailAlreadyRegisteredException();
        }

        AppUser user = userRepository.save(new AppUser(email, passwordEncoder.encode(request.password()), displayName));
        profileRepository.save(new UserProfile(user,
                safeSet(request.roles()), safeSet(request.interests()), safeSet(request.goals())));
        workspaceRepository.save(new Workspace(user, "Personal", WorkspaceType.PERSONAL, true));

        UserPrincipal principal = new UserPrincipal(user.getId(), user.getEmail(), user.getPasswordHash());
        return response(principal);
    }

    public AuthDtos.AuthResponse login(AuthDtos.LoginRequest request) {
        String email = request.email().trim().toLowerCase(Locale.ROOT);
        Authentication authentication = authenticationManager.authenticate(
                UsernamePasswordAuthenticationToken.unauthenticated(email, request.password()));
        UserPrincipal principal = (UserPrincipal) authentication.getPrincipal();
        return response(principal);
    }

    private AuthDtos.AuthResponse response(UserPrincipal principal) {
        AppUser user = userRepository.findById(principal.id()).orElseThrow();
        return new AuthDtos.AuthResponse(jwtService.generateToken(principal), "Bearer",
                jwtService.getExpirationSeconds(),
                new AuthDtos.UserSummary(user.getId(), user.getEmail(), user.getDisplayName()));
    }

    private Set<String> safeSet(Set<String> values) {
        if (values == null) return Set.of();
        return values.stream().filter(value -> value != null && !value.isBlank())
                .map(String::trim).collect(java.util.stream.Collectors.toUnmodifiableSet());
    }
}

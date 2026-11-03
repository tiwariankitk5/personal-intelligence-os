# Project Map

```text
src/main/java/com/pios/
├── PersonalIntelligenceApplication.java
├── auth/
│   ├── AuthController.java
│   ├── AuthDtos.java
│   ├── AuthService.java
│   ├── CustomUserDetailsService.java
│   ├── JwtAuthenticationFilter.java
│   ├── JwtService.java
│   └── UserPrincipal.java
├── common/
│   ├── config/
│   │   ├── JwtProperties.java
│   │   └── SecurityConfig.java
│   └── error/
│       ├── ApiError.java
│       ├── EmailAlreadyRegisteredException.java
│       ├── GlobalExceptionHandler.java
│       └── ResourceNotFoundException.java
├── profile/
│   ├── ProfileController.java
│   ├── ProfileDtos.java
│   ├── ProfileService.java
│   ├── UserProfile.java
│   └── UserProfileRepository.java
├── user/
│   ├── AppUser.java
│   └── AppUserRepository.java
└── workspace/
    ├── Workspace.java
    ├── WorkspaceController.java
    ├── WorkspaceDtos.java
    ├── WorkspaceRepository.java
    ├── WorkspaceService.java
    └── WorkspaceType.java
```

This is intentionally a small modular monolith. Keep controllers thin, business rules in services, persistence in repositories, and request/response contracts in DTOs.

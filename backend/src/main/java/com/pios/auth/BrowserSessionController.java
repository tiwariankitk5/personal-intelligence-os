package com.pios.auth;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.security.web.csrf.HttpSessionCsrfTokenRepository;
import org.springframework.web.bind.annotation.*;

/** Browser authentication uses an opaque, revocable server-side session, never a returned JWT. */
@RestController
@RequestMapping("/api/v1/auth")
public class BrowserSessionController {
    private final AuthService authService;
    private final CustomUserDetailsService users;
    private final HttpSessionSecurityContextRepository contexts = new HttpSessionSecurityContextRepository();
    private final HttpSessionCsrfTokenRepository csrfTokens = new HttpSessionCsrfTokenRepository();

    public BrowserSessionController(AuthService authService, CustomUserDetailsService users) {
        this.authService = authService;
        this.users = users;
    }

    @GetMapping("/csrf")
    public CsrfResponse csrf(CsrfToken token) {
        return new CsrfResponse(token.getHeaderName(), token.getToken());
    }

    @PostMapping("/session/register")
    @ResponseStatus(HttpStatus.CREATED)
    public AuthDtos.UserSummary register(@Valid @RequestBody AuthDtos.RegisterRequest body,
            HttpServletRequest request, HttpServletResponse response) {
        return establishSession(authService.register(body).user(), request, response);
    }

    @PostMapping("/session/login")
    public AuthDtos.UserSummary login(@Valid @RequestBody AuthDtos.LoginRequest body,
            HttpServletRequest request, HttpServletResponse response) {
        return establishSession(authService.login(body).user(), request, response);
    }

    private AuthDtos.UserSummary establishSession(AuthDtos.UserSummary user,
            HttpServletRequest request, HttpServletResponse response) {
        var principal = users.loadUserByUsername(user.email());
        // Rotate the anonymous CSRF session to prevent session fixation.
        if (request.getSession(false) != null) request.changeSessionId();
        var context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(new UsernamePasswordAuthenticationToken(principal, null, principal.getAuthorities()));
        SecurityContextHolder.setContext(context);
        contexts.saveContext(context, request, response);
        csrfTokens.saveToken(null, request, response);
        return user;
    }

    public record CsrfResponse(String headerName, String token) { }
}

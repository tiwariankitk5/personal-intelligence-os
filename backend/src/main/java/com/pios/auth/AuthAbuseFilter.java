package com.pios.auth;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.pios.common.error.ApiError;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.time.Instant;
import java.util.Map;
import org.springframework.web.filter.OncePerRequestFilter;

/** Runs before JSON validation and password hashing; ignores untrusted forwarding headers. */
public class AuthAbuseFilter extends OncePerRequestFilter {
    private final AuthAbuseGuard guard;
    private final ObjectMapper mapper;
    public AuthAbuseFilter(AuthAbuseGuard guard, ObjectMapper mapper) { this.guard=guard; this.mapper=mapper; }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String path = request.getRequestURI().substring(request.getContextPath().length());
        String operation = switch (path) {
            case "/api/v1/auth/login", "/api/v1/auth/session/login" -> "login";
            case "/api/v1/auth/register", "/api/v1/auth/session/register" -> "register";
            default -> null;
        };
        if (!"POST".equals(request.getMethod()) || operation == null) { chain.doFilter(request,response); return; }
        response.setHeader("Cache-Control", "no-store");
        try { guard.request(operation, request.getRemoteAddr()); }
        catch (AuthAbuseGuard.RateLimitedException ex) { reject(request,response,429,ex.getMessage(),ex.retryAfter()); return; }
        catch (AuthAbuseGuard.ProtectionUnavailableException ex) { reject(request,response,503,ex.getMessage(),5); return; }
        chain.doFilter(request,response);
    }
    private void reject(HttpServletRequest request, HttpServletResponse response, int status, String message, long retry) throws IOException {
        response.setStatus(status);
        response.setHeader("Retry-After", Long.toString(retry));
        response.setContentType("application/json");
        mapper.writeValue(response.getOutputStream(), new ApiError(Instant.now(),status,status==429 ? "Too Many Requests" : "Service Unavailable",message,request.getRequestURI(),Map.of()));
    }
}

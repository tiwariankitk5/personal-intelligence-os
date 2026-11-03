package com.pios.ai;

import java.net.URI;
import org.springframework.http.HttpStatus;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * OpenAI requires a loopback OAuth callback with the fixed path /auth/callback.
 * The local Docker Compose stack publishes backend port 8080 only on 127.0.0.1.
 * This endpoint is intentionally unauthenticated; the one-time OAuth state binds it to a PIOS user.
 */
@RestController
public class ChatGptOAuthCallbackController {
    private final ChatGptPlanService chatGpt;

    public ChatGptOAuthCallbackController(ChatGptPlanService chatGpt) {
        this.chatGpt = chatGpt;
    }

    @GetMapping("/auth/start")
    public ResponseEntity<Void> launch(@RequestParam String launch) {
        String openAiAuthorizationUrl = chatGpt.launchAuthorization(launch);
        return ResponseEntity.status(HttpStatus.FOUND)
                .cacheControl(CacheControl.noStore())
                .header("Pragma", "no-cache")
                .header("Referrer-Policy", "no-referrer")
                .location(URI.create(openAiAuthorizationUrl)).build();
    }

    @GetMapping(value = "/auth/callback", produces = MediaType.TEXT_HTML_VALUE)
    public ResponseEntity<String> callback(@RequestParam(required = false) String code,
                                           @RequestParam(required = false) String state,
                                           @RequestParam(required = false, name = "client_id") String clientId,
                                           @RequestParam(required = false) String error) {
        String html = chatGpt.completeCallback(code, state, clientId, error);
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .header("Pragma", "no-cache")
                .header("Referrer-Policy", "no-referrer")
                .header("X-Content-Type-Options", "nosniff")
                .header("Content-Security-Policy", "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")
                .contentType(MediaType.TEXT_HTML).body(html);
    }
}

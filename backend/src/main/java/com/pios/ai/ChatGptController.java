package com.pios.ai;

import com.pios.auth.UserPrincipal;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1/ai/chatgpt")
public class ChatGptController {
    private final ChatGptPlanService chatGpt;

    public ChatGptController(ChatGptPlanService chatGpt) {
        this.chatGpt = chatGpt;
    }

    @PostMapping("/connect")
    public ChatGptPlanService.ConnectStart connect() {
        return chatGpt.start(currentUserId());
    }

    @GetMapping("/connection")
    public ChatGptPlanService.ConnectionStatus connection() {
        return chatGpt.status(currentUserId());
    }

    @GetMapping("/models")
    public List<ChatGptPlanService.ChatGptModel> models() {
        return chatGpt.models(currentUserId());
    }

    @PostMapping("/model")
    public ResponseEntity<Void> activateModel(@Valid @RequestBody ModelRequest request) {
        chatGpt.activateModel(currentUserId(), request.modelName(), request.makeDefault());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/confirm")
    public ChatGptPlanService.ConnectionStatus confirm(@Valid @RequestBody ConfirmRequest request) {
        return chatGpt.confirmConnection(currentUserId(), request.state());
    }

    @DeleteMapping("/connection")
    public ChatGptPlanService.DisconnectResult disconnect() {
        return chatGpt.disconnect(currentUserId());
    }

    private UUID currentUserId() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !(authentication.getPrincipal() instanceof UserPrincipal principal)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Sign in to PIOS first.");
        }
        return principal.id();
    }

    public record ModelRequest(@NotBlank @Size(max = 180) String modelName, boolean makeDefault) { }
    public record ConfirmRequest(@NotBlank @Size(max = 100) String state) { }
}

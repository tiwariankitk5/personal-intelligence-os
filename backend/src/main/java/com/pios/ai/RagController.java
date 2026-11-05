package com.pios.ai;

import com.pios.auth.UserPrincipal;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.Map;
import java.util.UUID;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/ai/retrieval")
public class RagController {
    private final RagService rag;
    public RagController(RagService rag){this.rag=rag;}
    private UUID user(){return ((UserPrincipal)SecurityContextHolder.getContext().getAuthentication().getPrincipal()).id();}
    @GetMapping("/settings") public Map<String,Object> settings(){return rag.status(user());}
    @PutMapping("/settings") public Map<String,Object> configure(@Valid @RequestBody SettingsRequest body){
        rag.configure(user(),body.providerId(),body.model().trim(),body.dimensions(),body.requestDimensions(),body.enabled(),body.dailyCallLimit(),body.dailyInputLimit(),body.consent());
        return rag.status(user());
    }
    @PostMapping("/retry") public Map<String,Object> retry(){rag.retry(user());return rag.status(user());}
    @PostMapping("/rebuild") public Map<String,Object> rebuild(){rag.rebuild(user());return rag.status(user());}
    @PostMapping("/search") public RagService.SearchResult search(@Valid @RequestBody SearchRequest body){return rag.search(user(),body.query().trim());}
    public record SettingsRequest(UUID providerId,@NotBlank @Size(max=180) String model,@Min(1) @Max(3072) int dimensions,
                                  boolean requestDimensions,boolean enabled,@Min(1) @Max(1000) int dailyCallLimit,
                                  @Min(1000) @Max(1000000) int dailyInputLimit,boolean consent) { }
    public record SearchRequest(@NotBlank @Size(max=8000) String query) { }
}

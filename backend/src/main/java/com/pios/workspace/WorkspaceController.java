package com.pios.workspace;

import com.pios.auth.UserPrincipal;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.bind.annotation.ResponseStatus;

@RestController
@RequestMapping("/api/v1/workspaces")
public class WorkspaceController {
    private final WorkspaceService workspaceService;

    public WorkspaceController(WorkspaceService workspaceService) {
        this.workspaceService = workspaceService;
    }

    @GetMapping
    public List<WorkspaceDtos.WorkspaceResponse> list(@AuthenticationPrincipal UserPrincipal principal) {
        return workspaceService.list(principal.id());
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public WorkspaceDtos.WorkspaceResponse create(@AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody WorkspaceDtos.CreateWorkspaceRequest request) {
        return workspaceService.create(principal.id(), request);
    }

    @GetMapping("/{workspaceId}")
    public WorkspaceDtos.WorkspaceResponse get(@AuthenticationPrincipal UserPrincipal principal,
                                                @PathVariable UUID workspaceId) {
        return workspaceService.get(principal.id(), workspaceId);
    }

    @PatchMapping("/{workspaceId}")
    public WorkspaceDtos.WorkspaceResponse rename(@AuthenticationPrincipal UserPrincipal principal,
            @PathVariable UUID workspaceId,
            @Valid @RequestBody WorkspaceDtos.RenameWorkspaceRequest request) {
        return workspaceService.rename(principal.id(), workspaceId, request);
    }
}

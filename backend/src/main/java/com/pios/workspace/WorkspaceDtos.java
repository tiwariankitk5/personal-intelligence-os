package com.pios.workspace;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.UUID;

public final class WorkspaceDtos {
    private WorkspaceDtos() { }

    public record CreateWorkspaceRequest(@NotBlank @Size(max = 120) String name, @NotNull WorkspaceType type) { }
    public record RenameWorkspaceRequest(@NotBlank @Size(max = 120) String name) { }
    public record WorkspaceResponse(UUID id, String name, WorkspaceType type, boolean defaultWorkspace,
                                    Instant createdAt) { }
}

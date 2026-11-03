package com.pios.workspace;

import com.pios.common.error.ResourceNotFoundException;
import com.pios.user.AppUser;
import com.pios.user.AppUserRepository;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class WorkspaceService {
    private final WorkspaceRepository workspaceRepository;
    private final AppUserRepository userRepository;

    public WorkspaceService(WorkspaceRepository workspaceRepository, AppUserRepository userRepository) {
        this.workspaceRepository = workspaceRepository;
        this.userRepository = userRepository;
    }

    @Transactional(readOnly = true)
    public List<WorkspaceDtos.WorkspaceResponse> list(UUID ownerId) {
        return workspaceRepository.findAllByOwner_IdOrderByCreatedAtAsc(ownerId)
                .stream().map(this::toResponse).toList();
    }

    @Transactional
    public WorkspaceDtos.WorkspaceResponse create(UUID ownerId, WorkspaceDtos.CreateWorkspaceRequest request) {
        AppUser owner = userRepository.findById(ownerId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found."));
        Workspace workspace = workspaceRepository.save(
                new Workspace(owner, request.name().trim(), request.type(), false));
        return toResponse(workspace);
    }

    @Transactional(readOnly = true)
    public WorkspaceDtos.WorkspaceResponse get(UUID ownerId, UUID workspaceId) {
        return toResponse(findOwnedWorkspace(ownerId, workspaceId));
    }

    @Transactional
    public WorkspaceDtos.WorkspaceResponse rename(UUID ownerId, UUID workspaceId,
                                                   WorkspaceDtos.RenameWorkspaceRequest request) {
        Workspace workspace = findOwnedWorkspace(ownerId, workspaceId);
        workspace.rename(request.name().trim());
        return toResponse(workspace);
    }

    private Workspace findOwnedWorkspace(UUID ownerId, UUID workspaceId) {
        return workspaceRepository.findByIdAndOwner_Id(workspaceId, ownerId)
                .orElseThrow(() -> new ResourceNotFoundException("Workspace not found."));
    }

    private WorkspaceDtos.WorkspaceResponse toResponse(Workspace workspace) {
        return new WorkspaceDtos.WorkspaceResponse(workspace.getId(), workspace.getName(), workspace.getType(),
                workspace.isDefaultWorkspace(), workspace.getCreatedAt());
    }
}

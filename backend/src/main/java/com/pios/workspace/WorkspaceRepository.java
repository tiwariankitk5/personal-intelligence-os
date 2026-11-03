package com.pios.workspace;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface WorkspaceRepository extends JpaRepository<Workspace, UUID> {
    List<Workspace> findAllByOwner_IdOrderByCreatedAtAsc(UUID ownerId);
    Optional<Workspace> findByIdAndOwner_Id(UUID id, UUID ownerId);
}

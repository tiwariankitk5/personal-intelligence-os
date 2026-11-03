package com.pios.workspace;

import com.pios.user.AppUser;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "workspaces")
public class Workspace {
    @Id
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "owner_id", nullable = false)
    private AppUser owner;

    @Column(nullable = false, length = 120)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(name = "workspace_type", nullable = false, length = 30)
    private WorkspaceType type;

    @Column(name = "is_default", nullable = false)
    private boolean defaultWorkspace;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected Workspace() { }

    public Workspace(AppUser owner, String name, WorkspaceType type, boolean defaultWorkspace) {
        this.id = UUID.randomUUID();
        this.owner = owner;
        this.name = name;
        this.type = type;
        this.defaultWorkspace = defaultWorkspace;
    }

    @PrePersist
    void onCreate() {
        Instant now = Instant.now();
        createdAt = now;
        updatedAt = now;
    }

    @PreUpdate
    void onUpdate() { updatedAt = Instant.now(); }

    public UUID getId() { return id; }
    public AppUser getOwner() { return owner; }
    public String getName() { return name; }
    public WorkspaceType getType() { return type; }
    public boolean isDefaultWorkspace() { return defaultWorkspace; }
    public Instant getCreatedAt() { return createdAt; }

    public void rename(String name) { this.name = name; }
}

package com.pios.profile;

import com.pios.user.AppUser;
import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.time.Instant;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;

@Entity
@Table(name = "user_profiles")
public class UserProfile {
    @Id
    private UUID id;

    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false, unique = true)
    private AppUser user;

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "user_profile_roles", joinColumns = @JoinColumn(name = "profile_id"),
            uniqueConstraints = @UniqueConstraint(columnNames = {"profile_id", "role"}))
    @Column(name = "role", nullable = false, length = 60)
    private Set<String> roles = new HashSet<>();

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "user_profile_interests", joinColumns = @JoinColumn(name = "profile_id"),
            uniqueConstraints = @UniqueConstraint(columnNames = {"profile_id", "interest"}))
    @Column(name = "interest", nullable = false, length = 100)
    private Set<String> interests = new HashSet<>();

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "user_profile_goals", joinColumns = @JoinColumn(name = "profile_id"),
            uniqueConstraints = @UniqueConstraint(columnNames = {"profile_id", "goal"}))
    @Column(name = "goal", nullable = false, length = 100)
    private Set<String> goals = new HashSet<>();

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected UserProfile() { }

    public UserProfile(AppUser user, Set<String> roles, Set<String> interests, Set<String> goals) {
        this.id = UUID.randomUUID();
        this.user = user;
        this.roles = new HashSet<>(roles);
        this.interests = new HashSet<>(interests);
        this.goals = new HashSet<>(goals);
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
    public AppUser getUser() { return user; }
    public Set<String> getRoles() { return Set.copyOf(roles); }
    public Set<String> getInterests() { return Set.copyOf(interests); }
    public Set<String> getGoals() { return Set.copyOf(goals); }

    public void update(Set<String> roles, Set<String> interests, Set<String> goals) {
        this.roles.clear(); this.roles.addAll(roles);
        this.interests.clear(); this.interests.addAll(interests);
        this.goals.clear(); this.goals.addAll(goals);
    }
}

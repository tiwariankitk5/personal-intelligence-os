package com.pios.data;

import com.pios.auth.UserPrincipal;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1/drafts")
public class DraftSheetController {
    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;
    public DraftSheetController(JdbcTemplate jdbc, ObjectMapper mapper) { this.jdbc = jdbc; this.mapper = mapper; }

    @GetMapping
    public List<Sheet> list() {
        return jdbc.query("SELECT id,title,scene_data,updated_at FROM draft_sheets WHERE user_id=? ORDER BY updated_at DESC",
                (rs, row) -> new Sheet(rs.getObject("id", UUID.class), rs.getString("title"), rs.getString("scene_data"),
                        rs.getTimestamp("updated_at").toInstant()), userId());
    }

    @PutMapping("/{id}")
    public Sheet save(@PathVariable UUID id, @Valid @RequestBody SheetRequest request) {
        String scene = request.sceneData() == null ? "" : request.sceneData();
        if (!scene.isBlank()) {
            try {
                var data = mapper.readTree(scene);
                if (!data.isObject() || !data.path("elements").isArray() || data.path("elements").size() > 20000)
                    throw new IllegalArgumentException();
            } catch (Exception ex) { throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid drawing scene."); }
        }
        int changed = jdbc.update("""
                INSERT INTO draft_sheets(id,user_id,title,scene_data) VALUES (?,?,?,?)
                ON CONFLICT(id) DO UPDATE SET title=EXCLUDED.title,scene_data=EXCLUDED.scene_data,updated_at=now()
                WHERE draft_sheets.user_id=EXCLUDED.user_id
                """, id, userId(), request.title().trim(), scene);
        if (changed == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Draft not found.");
        return jdbc.queryForObject("SELECT id,title,scene_data,updated_at FROM draft_sheets WHERE id=? AND user_id=?",
                (rs, row) -> new Sheet(id, rs.getString("title"), rs.getString("scene_data"), rs.getTimestamp("updated_at").toInstant()), id, userId());
    }

    private UUID userId() {
        var authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !(authentication.getPrincipal() instanceof UserPrincipal principal))
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Sign in to use Draft.");
        return principal.id();
    }
    public record Sheet(UUID id, String title, String sceneData, Instant updatedAt) { }
    public record SheetRequest(@NotBlank @Size(max=160) String title, @Size(max=12_000_000) String sceneData) { }
}

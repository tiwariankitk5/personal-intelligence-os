package com.pios.data;

import com.pios.auth.UserPrincipal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabase;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabaseBuilder;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabaseType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.server.ResponseStatusException;

import static org.junit.jupiter.api.Assertions.*;

class SourceDeletionTest {
    @TempDir Path uploads;
    private EmbeddedDatabase database;
    private JdbcTemplate jdbc;
    private PiosDataController controller;
    private final UUID owner = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        database = new EmbeddedDatabaseBuilder().generateUniqueName(true).setType(EmbeddedDatabaseType.H2).build();
        jdbc = new JdbcTemplate(database);
        jdbc.execute("CREATE TABLE knowledge_sources (id UUID PRIMARY KEY, user_id UUID NOT NULL, storage_key VARCHAR(80))");
        controller = new PiosDataController(jdbc, uploads.toString(), 26214400);
        var principal = new UserPrincipal(owner, "owner@example.com", "unused");
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(principal, null, principal.getAuthorities()));
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
        database.shutdown();
    }

    @Test
    void deletesPastedTextWithoutAnUploadedFile() {
        UUID id = insertSource(owner, null);
        controller.deleteSource(id);
        assertEquals(0, sourceCount(id));
    }

    @Test
    void deletesUploadedSourceAndItsFile() throws Exception {
        String key = UUID.randomUUID() + ".txt";
        UUID id = insertSource(owner, key);
        Files.writeString(uploads.resolve(key), "knowledge");
        controller.deleteSource(id);
        assertEquals(0, sourceCount(id));
        assertFalse(Files.exists(uploads.resolve(key)));
    }

    @Test
    void cannotDeleteAnotherUsersSourceOrFile() throws Exception {
        String key = UUID.randomUUID() + ".txt";
        UUID id = insertSource(UUID.randomUUID(), key);
        Files.writeString(uploads.resolve(key), "private knowledge");
        var error = assertThrows(ResponseStatusException.class, () -> controller.deleteSource(id));
        assertEquals(HttpStatus.NOT_FOUND, error.getStatusCode());
        assertEquals(1, sourceCount(id));
        assertTrue(Files.exists(uploads.resolve(key)));
    }

    @Test
    void missingSourceReturnsNotFound() {
        var error = assertThrows(ResponseStatusException.class, () -> controller.deleteSource(UUID.randomUUID()));
        assertEquals(HttpStatus.NOT_FOUND, error.getStatusCode());
    }

    private UUID insertSource(UUID user, String key) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO knowledge_sources(id,user_id,storage_key) VALUES (?,?,?)", id, user, key);
        return id;
    }

    private int sourceCount(UUID id) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM knowledge_sources WHERE id=?", Integer.class, id);
    }
}

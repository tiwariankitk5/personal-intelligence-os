package com.pios.data;

import com.pios.auth.UserPrincipal;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.safety.Safelist;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1")
public class PiosDataController {
    private final JdbcTemplate jdbc;
    private final Path storagePath;
    private final long maxUploadBytes;

    public PiosDataController(JdbcTemplate jdbc,
            @Value("${app.storage.path:./data/uploads}") String storagePath,
            @Value("${app.limits.max-upload-bytes:26214400}") long maxUploadBytes) {
        this.jdbc = jdbc;
        this.storagePath = Path.of(storagePath).toAbsolutePath().normalize();
        this.maxUploadBytes = maxUploadBytes;
    }

    @GetMapping("/users/me")
    public UserResponse me() {
        UUID userId = currentUserId();
        return jdbc.queryForObject("SELECT id, email, display_name, created_at FROM app_users WHERE id = ?",
                (rs, row) -> new UserResponse(rs.getObject("id", UUID.class), rs.getString("email"),
                        rs.getString("display_name"), rs.getTimestamp("created_at").toInstant()), userId);
    }

    @GetMapping("/folders")
    @Transactional
    public List<FolderResponse> folders() {
        UUID userId = currentUserId();
        Integer count = jdbc.queryForObject("SELECT COUNT(*) FROM note_folders WHERE user_id = ?", Integer.class, userId);
        if (count != null && count == 0) seedFolders(userId);
        return jdbc.query("SELECT id, name, color FROM note_folders WHERE user_id = ? ORDER BY created_at, name",
                (rs, row) -> new FolderResponse(rs.getObject("id", UUID.class), rs.getString("name"), rs.getString("color")), userId);
    }

    @PostMapping("/folders")
    public FolderResponse createFolder(@Valid @RequestBody FolderRequest request) {
        UUID userId = currentUserId();
        UUID id = request.id() == null ? UUID.randomUUID() : request.id();
        try {
            jdbc.update("INSERT INTO note_folders(id,user_id,name,color) VALUES (?,?,?,?)",
                    id, userId, request.name().trim(), safeColor(request.color()));
        } catch (org.springframework.dao.DuplicateKeyException ex) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "A folder with this name already exists.");
        }
        return new FolderResponse(id, request.name().trim(), safeColor(request.color()));
    }

    @PutMapping("/folders/{id}")
    public FolderResponse updateFolder(@PathVariable UUID id, @Valid @RequestBody FolderRequest request) {
        UUID userId = currentUserId();
        int updated;
        try {
            updated = jdbc.update("UPDATE note_folders SET name=?, color=?, updated_at=now() WHERE id=? AND user_id=?",
                    request.name().trim(), safeColor(request.color()), id, userId);
        } catch (org.springframework.dao.DuplicateKeyException ex) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "A folder with this name already exists.");
        }
        if (updated == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Folder not found.");
        return new FolderResponse(id, request.name().trim(), safeColor(request.color()));
    }

    @DeleteMapping("/folders/{id}")
    @Transactional
    public void deleteFolder(@PathVariable UUID id) {
        UUID userId = currentUserId();
        UUID inboxId = jdbc.query("SELECT id FROM note_folders WHERE user_id=? AND lower(name)='inbox'",
                rs -> rs.next() ? rs.getObject(1, UUID.class) : null, userId);
        if (id.equals(inboxId)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The Inbox folder cannot be deleted.");
        jdbc.update("UPDATE notes SET folder_id=? WHERE user_id=? AND folder_id=?", inboxId, userId, id);
        int deleted = jdbc.update("DELETE FROM note_folders WHERE id=? AND user_id=?", id, userId);
        if (deleted == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Folder not found.");
    }

    @GetMapping("/notes")
    public List<NoteResponse> notes() {
        UUID userId = currentUserId();
        return jdbc.query("""
                SELECT id,title,body_html,plain_text,folder_id,color,is_pinned,is_archived,sort_order,updated_at
                FROM notes WHERE user_id=? ORDER BY is_pinned DESC, sort_order ASC, updated_at DESC
                """, (rs, row) -> new NoteResponse(rs.getObject("id", UUID.class), rs.getString("title"),
                rs.getString("body_html"), rs.getString("plain_text"), rs.getObject("folder_id", UUID.class),
                rs.getString("color"), rs.getBoolean("is_pinned"), rs.getBoolean("is_archived"),
                rs.getLong("sort_order"), rs.getTimestamp("updated_at").toInstant()), userId);
    }

    @PostMapping("/notes")
    public NoteResponse createNote(@Valid @RequestBody NoteRequest request) {
        UUID userId = currentUserId();
        UUID id = request.id() == null ? UUID.randomUUID() : request.id();
        validateFolder(request.folderId(), userId);
        String title = request.title().trim();
        String html = cleanHtml(request.bodyHtml());
        String plain = request.plainText() == null || request.plainText().isBlank() ? htmlToText(html) : request.plainText().trim();
        jdbc.update("""
                INSERT INTO notes(id,user_id,folder_id,title,body_html,plain_text,color,is_pinned,is_archived,sort_order)
                VALUES (?,?,?,?,?,?,?,?,?,?)
                """, id, userId, request.folderId(), title, html, plain, safeNoteColor(request.color()),
                request.pinned(), request.archived(), request.order());
        return noteById(id, userId);
    }

    @PutMapping("/notes/{id}")
    public NoteResponse updateNote(@PathVariable UUID id, @Valid @RequestBody NoteRequest request) {
        UUID userId = currentUserId();
        validateFolder(request.folderId(), userId);
        String html = cleanHtml(request.bodyHtml());
        String plain = request.plainText() == null || request.plainText().isBlank() ? htmlToText(html) : request.plainText().trim();
        int updated = jdbc.update("""
                UPDATE notes SET folder_id=?,title=?,body_html=?,plain_text=?,color=?,is_pinned=?,is_archived=?,sort_order=?,updated_at=now()
                WHERE id=? AND user_id=?
                """, request.folderId(), request.title().trim(), html, plain, safeNoteColor(request.color()),
                request.pinned(), request.archived(), request.order(), id, userId);
        if (updated == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Note not found.");
        return noteById(id, userId);
    }

    @DeleteMapping("/notes/{id}")
    public void deleteNote(@PathVariable UUID id) {
        int deleted = jdbc.update("DELETE FROM notes WHERE id=? AND user_id=?", id, currentUserId());
        if (deleted == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Note not found.");
    }

    @GetMapping("/sources")
    public List<SourceResponse> sources(@RequestParam(required = false) String q) {
        UUID userId = currentUserId();
        String filter = q == null ? "" : q.trim();
        return jdbc.query("""
                SELECT id,title,kind,collection_name,original_file_name,source_url,byte_size,updated_at
                FROM knowledge_sources WHERE user_id=? AND (?='' OR title ILIKE ? OR full_text ILIKE ?)
                ORDER BY updated_at DESC LIMIT 250
                """, (rs, row) -> new SourceResponse(rs.getObject("id", UUID.class), rs.getString("title"),
                rs.getString("kind"), rs.getString("collection_name"), rs.getString("original_file_name"),
                rs.getString("source_url"), rs.getLong("byte_size"), rs.getTimestamp("updated_at").toInstant()),
                userId, filter, "%" + filter + "%", "%" + filter + "%");
    }

    @PostMapping("/sources/upload")
    @Transactional
    public SourceResponse uploadSource(@RequestParam("file") MultipartFile file,
                                       @RequestParam(defaultValue = "Inbox") String collection) {
        UUID userId = currentUserId();
        if (file == null || file.isEmpty()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Choose a non-empty file.");
        if (file.getSize() > maxUploadBytes) throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "File exceeds the configured upload limit.");
        String original = file.getOriginalFilename() == null ? "upload" : Path.of(file.getOriginalFilename()).getFileName().toString();
        String extension = extension(original);
        if (!List.of("pdf", "txt", "md", "markdown").contains(extension)) {
            throw new ResponseStatusException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "V1 supports PDF, TXT and Markdown files.");
        }
        try {
            byte[] bytes = file.getBytes();
            String extracted = extractText(bytes, extension);
            if (extracted.isBlank()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No readable text was found in this file.");
            UUID id = UUID.randomUUID();
            Files.createDirectories(storagePath);
            String storageKey = id + "." + extension;
            Path destination = storagePath.resolve(storageKey).normalize();
            if (!destination.startsWith(storagePath)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid file name.");
            Files.write(destination, bytes);
            String title = original.replaceFirst("(?i)\\.[^.]+$", "");
            jdbc.update("""
                    INSERT INTO knowledge_sources(id,user_id,title,kind,collection_name,original_file_name,storage_key,mime_type,full_text,byte_size)
                    VALUES (?,?,?,?,?,?,?,?,?,?)
                    """, id, userId, title, extension.equals("pdf") ? "PDF" : "Document", cleanCollection(collection),
                    original, storageKey, file.getContentType(), extracted, bytes.length);
            insertChunks(id, userId, extracted);
            return sourceById(id, userId);
        } catch (IOException ex) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Could not store or parse the uploaded file.");
        }
    }

    @PostMapping("/sources/text")
    @Transactional
    public SourceResponse createTextSource(@Valid @RequestBody TextSourceRequest request) {
        UUID userId = currentUserId();
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO knowledge_sources(id,user_id,title,kind,collection_name,full_text)
                VALUES (?,?,?,?,?,?)
                """, id, userId, request.title().trim(), "Text", cleanCollection(request.collection()), request.content().trim());
        insertChunks(id, userId, request.content().trim());
        return sourceById(id, userId);
    }

    @DeleteMapping("/sources/{id}")
    @Transactional
    public void deleteSource(@PathVariable UUID id) {
        UUID userId = currentUserId();
        String key = jdbc.query("SELECT storage_key FROM knowledge_sources WHERE id=? AND user_id=?",
                rs -> rs.next() ? rs.getString(1) : null, id, userId);
        if (key == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Source not found.");
        jdbc.update("DELETE FROM knowledge_sources WHERE id=? AND user_id=?", id, userId);
        if (key != null) try { Files.deleteIfExists(storagePath.resolve(key).normalize()); } catch (IOException ignored) { }
    }

    @GetMapping("/learning/objectives")
    public List<LearningObjectiveResponse> learningObjectives() {
        UUID userId = currentUserId();
        return jdbc.query("""
                SELECT id,title,description,category,target_date,progress,created_at,updated_at
                FROM learning_objectives WHERE user_id=? ORDER BY updated_at DESC
                """, (rs, row) -> new LearningObjectiveResponse(rs.getObject("id", UUID.class), rs.getString("title"),
                rs.getString("description"), rs.getString("category"), rs.getObject("target_date", LocalDate.class),
                rs.getInt("progress"), rs.getTimestamp("created_at").toInstant(), rs.getTimestamp("updated_at").toInstant()), userId);
    }

    @PostMapping("/learning/objectives")
    public LearningObjectiveResponse createLearningObjective(@Valid @RequestBody LearningObjectiveRequest request) {
        UUID userId = currentUserId();
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO learning_objectives(id,user_id,title,description,category,target_date,progress)
                VALUES (?,?,?,?,?,?,?)
                """, id, userId, request.title().trim(), safeText(request.description()), safeTextDefault(request.category(), "General"),
                request.targetDate(), 0);
        return learningObjectiveById(id, userId);
    }

    @PatchMapping("/learning/objectives/{id}")
    public LearningObjectiveResponse updateLearningObjective(@PathVariable UUID id, @RequestBody LearningProgressRequest request) {
        if (request.progress() < 0 || request.progress() > 100) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Progress must be between 0 and 100.");
        int updated = jdbc.update("UPDATE learning_objectives SET progress=?, updated_at=now() WHERE id=? AND user_id=?",
                request.progress(), id, currentUserId());
        if (updated == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Learning objective not found.");
        return learningObjectiveById(id, currentUserId());
    }

    @DeleteMapping("/learning/objectives/{id}")
    public void deleteLearningObjective(@PathVariable UUID id) {
        int deleted = jdbc.update("DELETE FROM learning_objectives WHERE id=? AND user_id=?", id, currentUserId());
        if (deleted == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Learning objective not found.");
    }

    private void seedFolders(UUID userId) {
        String[][] defaults = {
                {"Inbox", "#7e9b8b"}, {"Backend Engineering", "#57917a"},
                {"AI & Machine Learning", "#8b7ac2"}, {"Computer Science", "#6993bc"},
                {"Projects", "#c38b5e"}, {"Personal", "#c17d8d"}
        };
        for (String[] folder : defaults) {
            jdbc.update("INSERT INTO note_folders(id,user_id,name,color) VALUES (?,?,?,?) ON CONFLICT(user_id,name) DO NOTHING",
                    UUID.randomUUID(), userId, folder[0], folder[1]);
        }
    }

    private void validateFolder(UUID folderId, UUID userId) {
        if (folderId == null) return;
        Integer count = jdbc.queryForObject("SELECT COUNT(*) FROM note_folders WHERE id=? AND user_id=?", Integer.class, folderId, userId);
        if (count == null || count == 0) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The selected folder does not exist in this workspace.");
    }

    private NoteResponse noteById(UUID id, UUID userId) {
        return jdbc.queryForObject("SELECT id,title,body_html,plain_text,folder_id,color,is_pinned,is_archived,sort_order,updated_at FROM notes WHERE id=? AND user_id=?",
                (rs, row) -> new NoteResponse(rs.getObject("id", UUID.class), rs.getString("title"), rs.getString("body_html"),
                        rs.getString("plain_text"), rs.getObject("folder_id", UUID.class), rs.getString("color"),
                        rs.getBoolean("is_pinned"), rs.getBoolean("is_archived"), rs.getLong("sort_order"),
                        rs.getTimestamp("updated_at").toInstant()), id, userId);
    }

    private SourceResponse sourceById(UUID id, UUID userId) {
        return jdbc.queryForObject("SELECT id,title,kind,collection_name,original_file_name,source_url,byte_size,updated_at FROM knowledge_sources WHERE id=? AND user_id=?",
                (rs, row) -> new SourceResponse(rs.getObject("id", UUID.class), rs.getString("title"), rs.getString("kind"),
                        rs.getString("collection_name"), rs.getString("original_file_name"), rs.getString("source_url"),
                        rs.getLong("byte_size"), rs.getTimestamp("updated_at").toInstant()), id, userId);
    }

    private LearningObjectiveResponse learningObjectiveById(UUID id, UUID userId) {
        return jdbc.queryForObject("SELECT id,title,description,category,target_date,progress,created_at,updated_at FROM learning_objectives WHERE id=? AND user_id=?",
                (rs, row) -> new LearningObjectiveResponse(rs.getObject("id", UUID.class), rs.getString("title"),
                        rs.getString("description"), rs.getString("category"), rs.getObject("target_date", LocalDate.class),
                        rs.getInt("progress"), rs.getTimestamp("created_at").toInstant(), rs.getTimestamp("updated_at").toInstant()), id, userId);
    }

    private void insertChunks(UUID sourceId, UUID userId, String text) {
        int max = 1800;
        int index = 0;
        for (int start = 0; start < text.length(); start += max) {
            String chunk = text.substring(start, Math.min(text.length(), start + max));
            jdbc.update("INSERT INTO content_chunks(id,user_id,source_id,chunk_index,content) VALUES (?,?,?,?,?)",
                    UUID.randomUUID(), userId, sourceId, index++, chunk);
        }
    }

    private String extractText(byte[] bytes, String extension) throws IOException {
        if (extension.equals("pdf")) {
            try (PDDocument document = Loader.loadPDF(bytes)) { return new PDFTextStripper().getText(document); }
        }
        return new String(bytes, StandardCharsets.UTF_8);
    }

    private String extension(String name) {
        int dot = name.lastIndexOf('.');
        return dot < 0 ? "" : name.substring(dot + 1).toLowerCase(Locale.ROOT);
    }

    private static final Safelist NOTE_HTML_SAFELIST = Safelist.none()
            .addTags("p", "br", "strong", "b", "em", "i", "u", "s", "strike", "ul", "ol", "li",
                    "a", "h1", "h2", "h3", "blockquote", "hr", "input", "pre", "code", "iframe", "img",
                    "table", "thead", "tbody", "tr", "th", "td")
            .addAttributes("a", "href")
            .addProtocols("a", "href", "http", "https", "mailto")
            .addAttributes("input", "type", "checked", "disabled")
            .addAttributes("pre", "data-language")
            .addAttributes("iframe", "src", "title", "loading", "referrerpolicy", "allow", "allowfullscreen", "sandbox")
            .addProtocols("iframe", "src", "https")
            .addAttributes("img", "src", "alt")
            .addProtocols("img", "src", "data");

    private String cleanHtml(String value) {
        if (value == null || value.isBlank()) return "";
        String bounded = value.length() > 100_000 ? value.substring(0, 100_000) : value;
        Document.OutputSettings output = new Document.OutputSettings().prettyPrint(false);
        String cleaned = Jsoup.clean(bounded, "", NOTE_HTML_SAFELIST, output);
        Document document = Jsoup.parseBodyFragment(cleaned);
        for (Element input : document.select("input")) {
            if (!"checkbox".equalsIgnoreCase(input.attr("type"))) {
                input.remove();
            } else {
                input.attr("type", "checkbox");
                input.attr("disabled", "disabled");
            }
        }
        for (Element iframe : document.select("iframe")) {
            try {
                java.net.URI uri = java.net.URI.create(iframe.attr("src"));
                boolean trustedHost = "www.youtube-nocookie.com".equalsIgnoreCase(uri.getHost())
                        || "www.youtube.com".equalsIgnoreCase(uri.getHost());
                if (!"https".equalsIgnoreCase(uri.getScheme()) || !trustedHost
                        || !uri.getPath().matches("/embed/[A-Za-z0-9_-]{11}")) {
                    iframe.remove();
                    continue;
                }
                iframe.attr("src", "https://www.youtube-nocookie.com" + uri.getPath());
                iframe.attr("title", "YouTube video");
                iframe.attr("loading", "lazy");
                iframe.attr("referrerpolicy", "strict-origin-when-cross-origin");
                iframe.attr("allow", "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share");
                iframe.attr("allowfullscreen", "allowfullscreen");
                iframe.attr("sandbox", "allow-scripts allow-same-origin allow-presentation");
            } catch (RuntimeException ex) {
                iframe.remove();
            }
        }
        for (Element image : document.select("img")) {
            String src = image.attr("src");
            if (!src.matches("data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+") || src.length() > 90_000) {
                image.remove();
            } else {
                image.attr("alt", image.attr("alt").substring(0, Math.min(160, image.attr("alt").length())));
            }
        }
        for (Element pre : document.select("pre")) {
            String language = pre.attr("data-language");
            if (!language.isBlank() && !language.matches("(?i)[a-z0-9+#.-]{1,24}")) pre.removeAttr("data-language");
        }
        return document.body().html();
    }

    private String htmlToText(String value) {
        return Jsoup.parseBodyFragment(value == null ? "" : value).text();
    }

    private String safeColor(String value) {
        if (value == null || !value.matches("#[0-9a-fA-F]{6}")) return "#7e9b8b";
        return value;
    }

    private String safeNoteColor(String value) {
        return List.of("sage", "butter", "lavender", "sky", "rose", "slate").contains(value) ? value : "sage";
    }

    private String cleanCollection(String value) { return safeTextDefault(value, "Inbox").substring(0, Math.min(120, safeTextDefault(value, "Inbox").length())); }
    private String safeText(String value) { return value == null ? "" : value.trim(); }
    private String safeTextDefault(String value, String fallback) { return value == null || value.isBlank() ? fallback : value.trim(); }

    private UUID currentUserId() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !(authentication.getPrincipal() instanceof UserPrincipal principal)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Sign in to access this workspace.");
        }
        return principal.id();
    }

    public record UserResponse(UUID id, String email, String displayName, Instant createdAt) { }
    public record FolderResponse(UUID id, String name, String color) { }
    public record FolderRequest(UUID id, @NotBlank @Size(max = 120) String name, String color) { }
    public record NoteResponse(UUID id, String title, String bodyHtml, String plainText, UUID folderId, String color,
                               boolean pinned, boolean archived, long order, Instant updatedAt) { }
    public record NoteRequest(UUID id, @NotBlank @Size(max = 240) String title, String bodyHtml, String plainText,
                              UUID folderId, String color, boolean pinned, boolean archived, long order) { }
    public record SourceResponse(UUID id, String title, String kind, String collection, String originalFileName,
                                 String sourceUrl, long byteSize, Instant updatedAt) { }
    public record TextSourceRequest(@NotBlank @Size(max = 400) String title, @NotBlank @Size(max = 100000) String content, String collection) { }
    public record LearningObjectiveResponse(UUID id, String title, String description, String category,
                                             LocalDate targetDate, int progress, Instant createdAt, Instant updatedAt) { }
    public record LearningObjectiveRequest(@NotBlank @Size(max = 240) String title, @Size(max = 4000) String description,
                                           String category, LocalDate targetDate) { }
    public record LearningProgressRequest(int progress) { }
}

import json
import re
from io import BytesIO
from uuid import UUID, uuid4

import nh3
from bs4 import BeautifulSoup
from fastapi import APIRouter, Depends, File, Form, Request, Response, UploadFile
from pydantic import Field, field_validator
from pypdf import PdfReader

from .db import view
from .security import Model, current_user, fail, pool

router = APIRouter(prefix="/api/v1", dependencies=[Depends(current_user)])
TAGS = set("p br strong b em i u s strike ul ol li a h1 h2 h3 h4 blockquote hr input img pre code table thead tbody tr th td".split())
ATTRS = {"a": {"href"}, "input": {"type", "checked", "disabled"}, "img": {"src", "alt", "title", "class", "data-pios-diagram-id", "contenteditable"}}


def clean_html(value):
    cleaned = nh3.clean(value or "", tags=TAGS, attributes=ATTRS, url_schemes={"https", "http", "mailto", "data"}, link_rel=None)
    soup = BeautifulSoup(cleaned, "html.parser")
    for link in soup.find_all("a"):
        if not re.match(r"^(https?://|mailto:)", link.get("href", ""), re.I):
            link.attrs.pop("href", None)
    for item in soup.find_all("input"):
        if item.get("type", "").lower() != "checkbox":
            item.decompose()
        else:
            item["type"], item["disabled"] = "checkbox", "disabled"
    for image in soup.find_all("img"):
        src, diagram = image.get("src", ""), image.get("data-pios-diagram-id", "")
        if not re.fullmatch(r"data:image/png;base64,[A-Za-z0-9+/]+={0,2}", src) or len(src) > 3_500_000 or not re.fullmatch(r"[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}", diagram, re.I):
            image.decompose()
        else:
            image.attrs = {"src": src, "data-pios-diagram-id": diagram, "alt": "Editable diagram — double-click to modify", "title": "Double-click to edit this diagram", "class": "pios-inline-diagram", "contenteditable": "false"}
    return str(soup)


class Folder(Model):
    id: UUID | None = None
    name: str = Field(min_length=1, max_length=120)
    color: str | None = None

    @field_validator("name")
    @classmethod
    def name_valid(cls, value):
        if not value.strip():
            raise ValueError("Name is required")
        return value.strip()


def folder_color(value):
    return value if re.fullmatch(r"#[0-9a-fA-F]{6}", value or "") else "#7e9b8b"


def own(conn, table, uid, item, lock=False):
    # table is always a server-side constant; identifiers never come from request data.
    row = conn.execute(f"SELECT * FROM {table} WHERE id=%s AND user_id=%s" + (" FOR UPDATE" if lock else ""), (item, uid)).fetchone()
    if not row:
        fail(404, "Item not found.")
    return row


@router.get("/folders")
def folders(request: Request, uid: UUID = Depends(current_user)):
    with pool(request).connection() as conn:
        conn.execute("SELECT pg_advisory_xact_lock(hashtextextended(%s,0))", (str(uid),))
        if not conn.execute("SELECT 1 FROM note_folders WHERE user_id=%s LIMIT 1", (uid,)).fetchone():
            for name, color in [("Inbox", "#7e9b8b"), ("AI & Machine Learning", "#9381b7"), ("Backend Engineering", "#4d9685"), ("Computer Science", "#6b98bd"), ("Personal", "#c47e95"), ("Projects", "#c48b5b")]:
                conn.execute("INSERT INTO note_folders(id,user_id,name,color) VALUES (%s,%s,%s,%s)", (uuid4(), uid, name, color))
        return [view(r) for r in conn.execute("SELECT id,name,color FROM note_folders WHERE user_id=%s ORDER BY created_at,name", (uid,))]


@router.post("/folders")
def create_folder(body: Folder, request: Request, uid: UUID = Depends(current_user)):
    with pool(request).connection() as conn:
        return view(conn.execute("INSERT INTO note_folders(id,user_id,name,color) VALUES (%s,%s,%s,%s) RETURNING id,name,color", (body.id or uuid4(), uid, body.name, folder_color(body.color))).fetchone())


@router.put("/folders/{item}")
def edit_folder(item: UUID, body: Folder, request: Request, uid: UUID = Depends(current_user)):
    with pool(request).connection() as conn:
        own(conn, "note_folders", uid, item)
        return view(conn.execute("UPDATE note_folders SET name=%s,color=%s,updated_at=now() WHERE id=%s AND user_id=%s RETURNING id,name,color", (body.name, folder_color(body.color), item, uid)).fetchone())


@router.delete("/folders/{item}")
def delete_folder(item: UUID, request: Request, uid: UUID = Depends(current_user)):
    with pool(request).connection() as conn:
        own(conn, "note_folders", uid, item, True)
        inbox = conn.execute("SELECT id FROM note_folders WHERE user_id=%s AND lower(name)='inbox'", (uid,)).fetchone()
        if inbox and inbox["id"] == item:
            fail(400, "The Inbox folder cannot be deleted.")
        conn.execute("UPDATE notes SET folder_id=%s WHERE user_id=%s AND folder_id=%s", (inbox["id"] if inbox else None, uid, item))
        conn.execute("DELETE FROM note_folders WHERE id=%s AND user_id=%s", (item, uid))
    return Response(status_code=200)


class Note(Model):
    id: UUID | None = None
    title: str = Field(min_length=1, max_length=240)
    body_html: str | None = Field(default="", max_length=4_000_000)
    plain_text: str | None = Field(default="", max_length=500_000)
    folder_id: UUID | None = None
    color: str | None = "sage"
    pinned: bool = False
    archived: bool = False
    order: int = Field(default=0, ge=-(2**63), lt=2**63)
    ink_data: str | None = Field(default="", max_length=12_000_000)
    cover_url: str | None = Field(default="", max_length=3_000_000)
    editor_settings: str | None = Field(default="{}", max_length=4000)

    @field_validator("title")
    @classmethod
    def title_valid(cls, value):
        if not value.strip():
            raise ValueError("Title is required")
        return value.strip()

    @field_validator("cover_url")
    @classmethod
    def cover_valid(cls, value):
        if value and not re.fullmatch(r"data:image/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}", value):
            raise ValueError("Use a PNG, JPEG, WebP or GIF cover image.")
        return value or ""

    @field_validator("editor_settings")
    @classmethod
    def settings_valid(cls, value):
        if not isinstance(json.loads(value or "{}"), dict):
            raise ValueError("Invalid page settings")
        return value or "{}"


NOTE_SELECT = "id,title,body_html,plain_text,folder_id,color,is_pinned,is_archived,sort_order,ink_data,cover_url,editor_settings,updated_at"


def note_view(row):
    return view(row, {"is_pinned": "pinned", "is_archived": "archived", "sort_order": "order"})


def write_note(conn, body, uid, item, create):
    if body.folder_id:
        own(conn, "note_folders", uid, body.folder_id)
    if not create:
        own(conn, "notes", uid, item, True)
    html = clean_html(body.body_html)
    plain = body.plain_text.strip() if body.plain_text and body.plain_text.strip() else BeautifulSoup(html, "html.parser").get_text(" ", strip=True)
    color = body.color if body.color in ("sage", "butter", "lavender", "sky", "rose", "slate") else "sage"
    values = (body.folder_id, body.title, html, plain, color, body.pinned, body.archived, body.order, (body.ink_data or "").strip(), body.cover_url, body.editor_settings)
    columns = "folder_id,title,body_html,plain_text,color,is_pinned,is_archived,sort_order,ink_data,cover_url,editor_settings"
    if create:
        row = conn.execute(f"INSERT INTO notes(id,user_id,{columns}) VALUES (%s,%s," + ",".join(["%s"] * len(values)) + f") RETURNING {NOTE_SELECT}", (item, uid, *values)).fetchone()
    else:
        setters = ",".join(c + "=%s" for c in columns.split(","))
        row = conn.execute(f"UPDATE notes SET {setters},updated_at=now() WHERE id=%s AND user_id=%s RETURNING {NOTE_SELECT}", (*values, item, uid)).fetchone()
    return note_view(row)


@router.get("/notes")
def notes(request: Request, uid: UUID = Depends(current_user)):
    with pool(request).connection() as conn:
        return [note_view(r) for r in conn.execute(f"SELECT {NOTE_SELECT} FROM notes WHERE user_id=%s ORDER BY is_pinned DESC,sort_order,updated_at DESC", (uid,))]


@router.post("/notes")
def create_note(body: Note, request: Request, uid: UUID = Depends(current_user)):
    with pool(request).connection() as conn:
        return write_note(conn, body, uid, body.id or uuid4(), True)


@router.put("/notes/{item}")
def edit_note(item: UUID, body: Note, request: Request, uid: UUID = Depends(current_user)):
    with pool(request).connection() as conn:
        return write_note(conn, body, uid, item, False)


@router.delete("/notes/{item}")
def delete_note(item: UUID, request: Request, uid: UUID = Depends(current_user)):
    with pool(request).connection() as conn:
        own(conn, "notes", uid, item)
        conn.execute("DELETE FROM notes WHERE id=%s AND user_id=%s", (item, uid))
    return Response(status_code=200)


class Sheet(Model):
    title: str = Field(min_length=1, max_length=160)
    scene_data: str | None = Field(default="", max_length=12_000_000)


@router.get("/drafts")
def drafts(request: Request, uid: UUID = Depends(current_user)):
    with pool(request).connection() as conn:
        return [view(r) for r in conn.execute("SELECT id,title,scene_data,updated_at FROM draft_sheets WHERE user_id=%s ORDER BY updated_at DESC", (uid,))]


@router.put("/drafts/{item}")
def save_draft(item: UUID, body: Sheet, request: Request, uid: UUID = Depends(current_user)):
    try:
        scene = json.loads(body.scene_data) if body.scene_data else None
        if scene is not None and (not isinstance(scene, dict) or not isinstance(scene.get("elements"), list) or len(scene["elements"]) > 20000):
            raise ValueError()
    except (ValueError, TypeError):
        fail(400, "Invalid drawing scene.")
    if not body.title.strip():
        fail(400, "Title is required.")
    with pool(request).connection() as conn:
        row = conn.execute('''INSERT INTO draft_sheets(id,user_id,title,scene_data) VALUES (%s,%s,%s,%s)
            ON CONFLICT(id) DO UPDATE SET title=excluded.title,scene_data=excluded.scene_data,updated_at=now()
            WHERE draft_sheets.user_id=excluded.user_id RETURNING id,title,scene_data,updated_at''', (item, uid, body.title.strip(), body.scene_data or "")).fetchone()
        if not row:
            fail(404, "Draft not found.")
        return view(row)


SOURCE_SELECT = "id,title,kind,collection_name,original_file_name,source_url,byte_size,updated_at"


def source_view(row):
    return view(row, {"collection_name": "collection"})


@router.get("/sources")
def sources(request: Request, q: str = "", uid: UUID = Depends(current_user)):
    with pool(request).connection() as conn:
        return [source_view(r) for r in conn.execute(f"SELECT {SOURCE_SELECT} FROM knowledge_sources WHERE user_id=%s AND (%s='' OR title ILIKE %s OR full_text ILIKE %s) ORDER BY updated_at DESC LIMIT 250", (uid, q.strip(), "%" + q.strip() + "%", "%" + q.strip() + "%"))]


class TextSource(Model):
    title: str = Field(min_length=1, max_length=400)
    content: str = Field(min_length=1, max_length=100000)
    collection: str | None = "Inbox"


@router.post("/sources/text")
def text_source(body: TextSource, request: Request, uid: UUID = Depends(current_user)):
    if not body.title.strip() or not body.content.strip():
        fail(400, "Title and content are required.")
    with pool(request).connection() as conn:
        return source_view(conn.execute(f"INSERT INTO knowledge_sources(id,user_id,title,kind,collection_name,full_text) VALUES (%s,%s,%s,'Text',%s,%s) RETURNING {SOURCE_SELECT}", (uuid4(), uid, body.title.strip(), (body.collection or "Inbox").strip()[:120] or "Inbox", body.content.strip())).fetchone())


def extract_text(raw, extension):
    if extension == "pdf":
        if not raw.startswith(b"%PDF-"):
            fail(415, "The file is not a PDF.")
        try:
            reader = PdfReader(BytesIO(raw), strict=True)
            if reader.is_encrypted or len(reader.pages) > 500:
                fail(400, "Use an unencrypted PDF with at most 500 pages.")
            parts, count = [], 0
            for page in reader.pages:
                text = page.extract_text() or ""
                count += len(text)
                if count > 500_000:
                    fail(413, "Extracted PDF text exceeds the limit.")
                parts.append(text)
            return "\n".join(parts)
        except Exception as ex:
            from fastapi import HTTPException
            if isinstance(ex, HTTPException):
                raise
            fail(400, "The PDF could not be parsed.")
    try:
        value = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        fail(415, "Text documents must contain UTF-8 text.")
    if "\0" in value:
        fail(415, "Binary content is not a text document.")
    return value[:500000]


@router.post("/sources/upload")
def upload(request: Request, file: UploadFile = File(...), collection: str = Form("Inbox"), uid: UUID = Depends(current_user)):
    settings = request.app.state.settings
    raw = file.file.read(settings.upload_limit + 1)
    if not raw:
        fail(400, "Choose a non-empty file.")
    if len(raw) > settings.upload_limit:
        fail(413, "File exceeds the configured upload limit.")
    name = (file.filename or "upload").replace("\\", "/").split("/")[-1][:500]
    extension = name.rsplit(".", 1)[-1].lower()
    if extension not in ("pdf", "txt", "md", "markdown"):
        fail(415, "V1 supports PDF, TXT and Markdown files.")
    text = extract_text(raw, extension)
    if not text.strip():
        fail(400, "No readable text was found in this file.")
    uid_source = uuid4()
    key = f"{uid_source}.{extension}"
    settings.storage.mkdir(parents=True, exist_ok=True)
    target = settings.storage / key
    try:
        with target.open("xb") as handle:
            handle.write(raw)
        with pool(request).connection() as conn:
            return source_view(conn.execute(f'''INSERT INTO knowledge_sources(id,user_id,title,kind,collection_name,original_file_name,storage_key,mime_type,full_text,byte_size)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING {SOURCE_SELECT}''', (uid_source, uid, name.rsplit(".", 1)[0][:400], "PDF" if extension == "pdf" else "Document", collection.strip()[:120] or "Inbox", name, key, file.content_type, text, len(raw))).fetchone())
    except Exception:
        target.unlink(missing_ok=True)
        raise


@router.delete("/sources/{item}")
def delete_source(item: UUID, request: Request, uid: UUID = Depends(current_user)):
    with pool(request).connection() as conn:
        row = own(conn, "knowledge_sources", uid, item, True)
        conn.execute("DELETE FROM knowledge_sources WHERE id=%s AND user_id=%s", (item, uid))
    if row["storage_key"]:
        target = (request.app.state.settings.storage / row["storage_key"]).resolve()
        if target.parent == request.app.state.settings.storage:
            target.unlink(missing_ok=True)
    return Response(status_code=200)

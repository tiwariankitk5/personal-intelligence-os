import base64
from types import SimpleNamespace
from uuid import uuid4

import pytest
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from fastapi import HTTPException

from pios.content import clean_html, extract_text
from pios.gateway import decrypt, embeddings, encrypt, endpoint, fuse, verify
from pios.learning import parse_video, study_plan, transcript, validate_draft


def config():
    return SimpleNamespace(encryption_key=b"0123456789abcdef0123456789abcdef", local_models=False, cloud_hosts={"api.openai.com"})


def test_java_aes_gcm_layout_and_tamper():
    settings = config()
    nonce = b"0123456789ab"
    # Java packs IV followed by ciphertext + the 128-bit GCM tag, without AAD.
    old = "v1:" + base64.b64encode(nonce + AESGCM(settings.encryption_key).encrypt(nonce, b"existing-key", None)).decode()
    assert decrypt(settings, old) == "existing-key"
    assert decrypt(settings, encrypt(settings, "new-key")) == "new-key"
    corrupted = old[:-4] + "AAAA"
    with pytest.raises(Exception):
        decrypt(settings, corrupted)


@pytest.mark.parametrize("url", ["http://api.openai.com/v1", "https://api.openai.com.evil/v1", "https://user@api.openai.com/v1", "https://api.openai.com:444/v1", "http://169.254.169.254", "http://localhost:11434/v1", "https://api.openai.com/v1?key=x"])
def test_endpoint_rejects_unapproved_urls(url):
    with pytest.raises(HTTPException):
        endpoint(config(), url)


def test_local_models_require_operator_opt_in():
    settings = config()
    settings.local_models = True
    assert endpoint(settings, "http://localhost:11434/v1/") == "http://localhost:11434/v1"
    with pytest.raises(HTTPException):
        endpoint(settings, "http://localhost:8080/v1")


def test_html_retains_editor_blocks_and_removes_active_content():
    value = clean_html('<h1>Heading</h1><script>bad()</script><a href="javascript:bad()">x</a><a href="data:text/html,x">bad</a><input type="text"><input type="checkbox" checked><pre><code>x</code></pre><table><tr><td>cell</td></tr></table><img src="https://evil/x" onerror="bad()">')
    assert all(s not in value for s in ("script", "javascript:", "data:text", "onerror", "https://evil", 'type="text"'))
    assert all(s in value for s in ("<code>", "<table>", "checkbox", "disabled"))
    diagram = uuid4()
    valid = clean_html(f'<img src="data:image/png;base64,YQ==" data-pios-diagram-id="{diagram}">')
    assert "pios-inline-diagram" in valid and str(diagram) in valid


def test_upload_sniffing_rejects_binary_and_fake_pdf():
    for raw, kind in [(b"fake PDF", "pdf"), (b"binary\0text", "txt"), (b"\xff\xff", "md")]:
        with pytest.raises(HTTPException):
            extract_text(raw, kind)
    assert extract_text(b"hello", "txt") == "hello"


def test_citations_filter_unknown_numbers():
    p = {"chunkId": uuid4(), "id": uuid4(), "type": "note", "chunkIndex": 0, "title": "Evidence", "excerpt": "Supported"}
    answer, citations = verify("A [1] [999] [999999999999999999999]", [p])
    assert answer.count("[unsupported citation]") == 2
    assert len(citations) == 1 and citations[0]["number"] == 1
    assert "unverified" in verify("No reference", [p])[0]
    assert len(fuse([p], [p])) == 1


def test_youtube_urls_and_transcripts():
    assert parse_video("https://youtu.be/M7lc1UVf-VE?t=3m12s") == ("M7lc1UVf-VE", 192)
    with pytest.raises(HTTPException):
        parse_video("https://youtube.com.evil/watch?v=M7lc1UVf-VE")
    segments, timed = transcript("00:00 Store the event.\n03:12 Relay it after commit.")
    assert timed and segments[1]["seconds"] == 192
    for value in ("03:00 a\n02:00 b", "00:99 x", ""):
        with pytest.raises(HTTPException):
            transcript(value)
    raw = {"article": "Study this", "questions": [{"prompt": "When?", "options": ["Before", "After"], "correctIndex": 1, "explanation": "Commit first", "evidenceSegment": 2, "sourceQuote": "after commit"}]}
    assert validate_draft("Lesson", raw, segments, timed)["questions"][0]["replaySeconds"] == 192
    raw["questions"][0]["sourceQuote"] = "invented"
    with pytest.raises(HTTPException):
        validate_draft("Lesson", raw, segments, timed)


def test_study_plan_splits_remaining_work():
    lessons = [{"id": uuid4(), "title": "Long lesson", "durationMinutes": 75, "completed": False, "known": False}]
    assert [b["minutes"] for b in study_plan(lessons, 30)] == [30, 30, 15]
    lessons[0]["known"] = True
    assert study_plan(lessons, 30) == []


def test_embedding_batch_validation(monkeypatch):
    from pios import gateway
    conf = {"model_name": "test", "dimensions": 2, "request_dimensions": False, "base_url": None}
    monkeypatch.setattr(gateway, "post", lambda *a, **k: {"data": [{"index": 0, "embedding": [0, 0]}]})
    with pytest.raises(HTTPException):
        embeddings(config(), conf, ["hello"])
    monkeypatch.setattr(gateway, "post", lambda *a, **k: {"data": [{"index": 0, "embedding": [1, 2]}], "usage": {"total_tokens": 2}})
    assert embeddings(config(), conf, ["hello"]) == ([[1, 2]], 2)

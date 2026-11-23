import base64
import json
import math
import os
import re
from urllib.parse import quote, urlsplit

import httpx
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from fastapi import HTTPException

from .security import fail


def encrypt(settings, value):
    if not value:
        return None
    nonce = os.urandom(12)
    return "v1:" + base64.b64encode(nonce + AESGCM(settings.encryption_key).encrypt(nonce, value.encode(), None)).decode()


def decrypt(settings, value):
    if not value:
        return ""
    if not value.startswith("v1:"):
        raise ValueError("Unsupported credential format")
    raw = base64.b64decode(value[3:], validate=True)
    return AESGCM(settings.encryption_key).decrypt(raw[:12], raw[12:], None).decode()


def endpoint(settings, value):
    url = (value or "https://api.openai.com/v1").strip().rstrip("/")
    try:
        parsed = urlsplit(url)
        local = parsed.hostname in {"localhost", "127.0.0.1", "host.docker.internal"}
        valid = (settings.local_models and parsed.scheme == "http" and parsed.port in (11434, 1234)) if local else (parsed.scheme == "https" and parsed.hostname in settings.cloud_hosts and parsed.port in (None, 443))
        if not valid or parsed.username or parsed.password or parsed.query or parsed.fragment or "\\" in url:
            raise ValueError()
    except ValueError:
        fail(400, "This provider endpoint is not approved.")
    return url


def post(url, body, headers, maximum=2_000_000, timeout=60):
    try:
        with httpx.Client(timeout=httpx.Timeout(timeout, connect=10), follow_redirects=False, trust_env=False) as client:
            with client.stream("POST", url, json=body, headers=headers) as response:
                if not 200 <= response.status_code < 300:
                    fail(502, f"The AI provider returned HTTP {response.status_code}. Check credentials, model and quota.")
                chunks, size = [], 0
                for chunk in response.iter_bytes():
                    size += len(chunk)
                    if size > maximum:
                        fail(502, "The AI provider response exceeded the size limit.")
                    chunks.append(chunk)
                return json.loads(b"".join(chunks))
    except (httpx.HTTPError, ValueError):
        fail(502, "Could not contact the configured AI provider or parse its response.")


def complete(settings, provider, system, prompt):
    key = decrypt(settings, provider.get("encrypted_api_key"))
    kind, model = provider["provider_type"], provider["model_name"]
    if kind == "ANTHROPIC":
        result = post("https://api.anthropic.com/v1/messages", {"model": model, "max_tokens": 1800, "system": system, "messages": [{"role": "user", "content": prompt}]}, {"x-api-key": key, "anthropic-version": "2023-06-01"})
        answer = "".join(part.get("text", "") for part in result.get("content", []) if part.get("type") == "text")
    elif kind == "GEMINI":
        model = quote(model.removeprefix("models/"), safe="")
        result = post(f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent", {"systemInstruction": {"parts": [{"text": system}]}, "contents": [{"role": "user", "parts": [{"text": prompt}]}], "generationConfig": {"temperature": 0.2, "maxOutputTokens": 1800}}, {"x-goog-api-key": key})
        candidates = result.get("candidates", [])
        answer = "".join(p.get("text", "") for p in candidates[0].get("content", {}).get("parts", [])) if candidates else ""
    else:
        result = post(endpoint(settings, provider.get("base_url")) + "/chat/completions", {"model": model, "temperature": 0.2, "max_tokens": 1800, "messages": [{"role": "system", "content": system}, {"role": "user", "content": prompt}]}, {"Authorization": "Bearer " + key} if key else {})
        choices = result.get("choices", [])
        answer = choices[0].get("message", {}).get("content", "") if choices else ""
    if not isinstance(answer, str) or not answer.strip():
        fail(502, "The configured model returned an empty response.")
    return answer


def embeddings(settings, config, inputs):
    if not inputs or len(inputs) > 16 or any(not s.strip() or len(s.encode()) > 7000 for s in inputs):
        fail(502, "Embedding input is outside supported batch limits.")
    body = {"model": config["model_name"], "input": inputs, "encoding_format": "float"}
    if config["request_dimensions"]:
        body["dimensions"] = config["dimensions"]
    key = decrypt(settings, config.get("encrypted_api_key"))
    try:
        raw = post(endpoint(settings, config.get("base_url")) + "/embeddings", body, {"Authorization": "Bearer " + key} if key else {}, timeout=30)
    except HTTPException:
        fail(502, "Embedding provider rejected the request. Check its model, credentials and quota.")
    data = raw.get("data", [])
    if not isinstance(data, list) or len(data) != len(inputs):
        fail(502, "Embedding provider returned an invalid batch.")
    vectors = [None] * len(inputs)
    for entry in data:
        index, vector = entry.get("index"), entry.get("embedding")
        if type(index) is not int or not 0 <= index < len(inputs) or vectors[index] is not None or not isinstance(vector, list) or len(vector) != config["dimensions"]:
            fail(502, "Embedding provider returned incompatible vector dimensions or indices.")
        if any(type(v) not in (int, float) or not math.isfinite(v) for v in vector) or not any(vector):
            fail(502, "Embedding provider returned an invalid vector.")
        vectors[index] = vector
    tokens = raw.get("usage", {}).get("total_tokens", 0)
    return vectors, max(0, tokens) if type(tokens) is int else 0


def vector_literal(vector):
    return json.dumps(vector, allow_nan=False, separators=(",", ":"))


def fuse(lexical, semantic, limit=5):
    items, scores = {}, {}
    for group in (lexical, semantic):
        for index, item in enumerate(group):
            key = str(item["chunkId"])
            items[key] = item
            scores[key] = scores.get(key, 0) + 1 / (61 + index)
    result, counts = [], {}
    for key in sorted(items, key=lambda k: (-scores[k], k)):
        item = items[key]
        document = (item["type"], str(item["id"]))
        if counts.get(document, 0) >= 2:
            continue
        counts[document] = counts.get(document, 0) + 1
        result.append(item)
        if len(result) >= limit:
            break
    return result


def verify(answer, passages):
    used = set()
    def replace(match):
        n = int(match[1]) if len(match[1]) <= 9 else 0
        if 0 < n <= len(passages):
            used.add(n)
            return match[0]
        return "[unsupported citation]"
    answer = re.sub(r"\[(\d+)\]", replace, answer)
    citations = [{"number": n, **passages[n - 1]} for n in sorted(used)]
    if passages and not citations:
        answer += "\n\nNo workspace passage was cited. Treat this answer as unverified general information."
    return answer, citations

"""Small on-disk cache for PUBLIC job feed JSON only.

Never cache API keys, resumes, application answers, or user profiles.
"""
from __future__ import annotations
import hashlib
import json
import time
from pathlib import Path

CACHE_DIR = Path(__file__).resolve().parent.parent / ".cache"

def get_cached(key: str, ttl_seconds: int, fetch):
    path = CACHE_DIR / (hashlib.sha256(key.encode()).hexdigest() + ".json")
    if path.exists() and (time.time() - path.stat().st_mtime) < ttl_seconds:
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            pass
    data = fetch()
    try:
        CACHE_DIR.mkdir(exist_ok=True)
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps(data), encoding="utf-8")
        tmp.replace(path)
    except OSError:
        pass
    return data

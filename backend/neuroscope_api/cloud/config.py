"""Explicit server-only opt-in; never infer cloud enablement from frontend env."""

import os
import re
from dataclasses import dataclass, field


@dataclass(frozen=True)
class CloudSettings:
    url: str
    publishable_key: str = field(repr=False)
    max_file_bytes: int = 50_000_000
    request_timeout: float = 10.0
    download_timeout: float = 60.0

    def __post_init__(self):
        if not re.fullmatch(r"https://[a-z0-9-]+\.supabase\.co", self.url):
            raise ValueError("Use the fixed HTTPS Supabase project origin")
        if not re.fullmatch(r"sb_publishable_[A-Za-z0-9_-]+", self.publishable_key):
            raise ValueError("Only a publishable API key is accepted")
        if not 1 <= self.max_file_bytes <= 50_000_000:
            raise ValueError("Cloud limit must be within the prepared bucket cap")
        if not 0 < self.request_timeout <= 30 or not 0 < self.download_timeout <= 120:
            raise ValueError("Invalid cloud timeout")

    @property
    def issuer(self):
        return self.url + "/auth/v1"

    @classmethod
    def from_env(cls):
        enabled = os.environ.get("NEUROSCOPE_CLOUD_ENABLED", "false")
        if enabled == "false":
            return None
        if enabled != "true":
            raise ValueError("NEUROSCOPE_CLOUD_ENABLED must be true or false")
        return cls(
            url=os.environ.get("NEUROSCOPE_SUPABASE_URL", "").rstrip("/"),
            publishable_key=os.environ.get("NEUROSCOPE_SUPABASE_PUBLISHABLE_KEY", ""),
            max_file_bytes=int(os.environ.get("NEUROSCOPE_CLOUD_MAX_FILE_BYTES", "50000000")),
        )

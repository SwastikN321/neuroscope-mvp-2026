"""Server-only broker settings. The public release gate is separate from credentials."""

import os
import re
from dataclasses import dataclass, field
from uuid import UUID

from .config import CloudSettings


@dataclass(frozen=True)
class BrokerSettings:
    cloud: CloudSettings
    secret_key: str = field(repr=False)
    test_users: frozenset[UUID] = frozenset()
    release_approved: bool = False
    allowed_origins: tuple[str, ...] = ("http://127.0.0.1:5173", "http://localhost:5173")
    allowed_hosts: tuple[str, ...] = ("127.0.0.1", "localhost", "[::1]")

    def __post_init__(self):
        if not re.fullmatch(r"sb_secret_[A-Za-z0-9_-]+", self.secret_key):
            raise ValueError("A server-only Supabase secret API key is required")
        if not self.release_approved and not self.test_users:
            raise ValueError("Cloud testing requires explicit account UUID allowlisting")
        if any(
            not (
                o.startswith("https://") or o in {"http://127.0.0.1:5173", "http://localhost:5173"}
            )
            or o.endswith("/")
            for o in self.allowed_origins
        ):
            raise ValueError("Use exact HTTPS frontend origins (loopback allowed for development)")
        if not self.allowed_hosts or any("*" in h or "/" in h for h in self.allowed_hosts):
            raise ValueError("Use explicit API hostnames")

    @classmethod
    def from_env(cls):
        cloud = CloudSettings.from_env()
        if cloud is None:
            raise ValueError("Cloud broker is disabled; explicit opt-in required")
        return cls(
            cloud=cloud,
            secret_key=os.environ.get("NEUROSCOPE_SUPABASE_SECRET_KEY", ""),
            test_users=frozenset(
                UUID(v.strip())
                for v in os.environ.get("NEUROSCOPE_CLOUD_TEST_USER_IDS", "").split(",")
                if v.strip()
            ),
            release_approved=os.environ.get("NEUROSCOPE_CLOUD_RELEASE_APPROVED") == "true",
            allowed_origins=tuple(
                os.environ.get(
                    "NEUROSCOPE_CLOUD_ORIGINS", "http://127.0.0.1:5173,http://localhost:5173"
                ).split(",")
            ),
            allowed_hosts=tuple(
                os.environ.get("NEUROSCOPE_CLOUD_HOSTS", "127.0.0.1,localhost,[::1]").split(",")
            ),
        )

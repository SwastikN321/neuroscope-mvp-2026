"""Bounded local service configuration; no credentials or public storage paths."""

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    max_upload_bytes: int = 64 * 1024 * 1024
    max_storage_bytes: int = 256 * 1024 * 1024
    max_recordings: int = 4
    ttl_seconds: float = 3600.0
    cleanup_interval: float = 30.0
    upload_timeout: float = 30.0
    max_window_seconds: float = 30.0
    max_window_values: int = 250_000
    max_selected_channels: int = 32

    def __post_init__(self):
        limits = {
            "max_upload_bytes": (1024, 512 * 1024 * 1024),
            "max_storage_bytes": (1024, 1024 * 1024 * 1024),
            "max_recordings": (1, 16),
            "ttl_seconds": (0.01, 86400),
            "cleanup_interval": (0.01, 300),
            "upload_timeout": (0.01, 120),
            "max_window_seconds": (0.01, 60),
            "max_window_values": (1, 1_000_000),
            "max_selected_channels": (1, 64),
        }
        for name, (low, high) in limits.items():
            if not low <= getattr(self, name) <= high:
                raise ValueError(f"Invalid setting: {name}")

    @classmethod
    def from_env(cls):
        return cls(
            **{
                name: type(default)(os.environ.get("NEUROSCOPE_" + name.upper(), default))
                for name, default in vars(cls()).items()
            }
        )

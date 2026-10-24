"""Separate cloud-only entrypoint. Never deploy the unauthenticated local EEG app."""

import os
import tempfile
from pathlib import Path

import uvicorn

from .cloud.api import create_cloud_app
from .cloud.broker_config import BrokerSettings

if __name__ == "__main__":
    settings = BrokerSettings.from_env()
    base = Path(
        os.environ.get(
            "NEUROSCOPE_CLOUD_CACHE",
            str(Path(tempfile.gettempdir()) / f"neuroscope-cloud-cache-{os.getuid()}"),
        )
    )
    uvicorn.run(
        create_cloud_app(settings, base),
        host=os.environ.get("NEUROSCOPE_CLOUD_BIND", "127.0.0.1"),
        port=int(os.environ.get("PORT", "8001")),
        workers=1,
        access_log=False,
        proxy_headers=False,
        limit_concurrency=8,
        timeout_keep_alive=5,
        log_level="warning",
    )

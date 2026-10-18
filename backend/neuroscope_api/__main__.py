import uvicorn

from .main import create_app

if __name__ == "__main__":
    # A single worker owns the ephemeral store. No public bind or forwarded IP trust.
    uvicorn.run(
        create_app(),
        host="127.0.0.1",
        port=8000,
        workers=1,
        access_log=False,
        proxy_headers=False,
        limit_concurrency=8,
        timeout_keep_alive=5,
        log_level="warning",
    )

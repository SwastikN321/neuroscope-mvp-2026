"""Optional read-only local preparation endpoint. No cloud upload/public integration."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends

from .auth import Identity, TokenVerifier
from .recordings import CloudRecordings


def cloud_router(verifier: TokenVerifier, recordings: CloudRecordings):
    router = APIRouter(prefix="/api/cloud")

    @router.get("/recordings/{recording_id}")
    async def metadata(recording_id: UUID, identity: Annotated[Identity, Depends(verifier)]):
        row = await recordings.get(recording_id, identity)
        # Object path and owner identifiers are not required in this response.
        return row.model_dump(mode="json", exclude={"owner_id", "object_path"})

    return router

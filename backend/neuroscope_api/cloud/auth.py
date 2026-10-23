"""Trusted Auth verification plus strict application claims, without storing sessions.

The Auth server verifies signature/validity. Decoding below is NOT a substitute
for cryptographic verification; no decoded claim is trusted before /auth/v1/user.
"""

import base64
import json
import math
import re
import time
from dataclasses import dataclass, field
from uuid import UUID

import httpx
from fastapi import Header

from ..errors import RecordingError
from .config import CloudSettings


def auth_error():
    return RecordingError(
        401, "invalid_access_token", "A valid confirmed account session is required."
    )


@dataclass(frozen=True)
class Identity:
    user_id: UUID
    token: str = field(repr=False)
    expires_at: float


class TokenVerifier:
    def __init__(self, settings: CloudSettings, client: httpx.AsyncClient):
        self.settings, self.client = settings, client

    async def __call__(self, authorization: str | None = Header(default=None)) -> Identity:
        if not authorization or not authorization.startswith("Bearer "):
            raise auth_error()
        token = authorization[7:]
        if len(token) > 16384 or not re.fullmatch(
            r"[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", token
        ):
            raise auth_error()
        try:
            # Fixed trusted origin; redirects disabled to avoid forwarding credentials.
            response = await self.client.get(
                self.settings.issuer + "/user",
                headers={
                    "apikey": self.settings.publishable_key,
                    "Authorization": "Bearer " + token,
                },
                timeout=self.settings.request_timeout,
                follow_redirects=False,
            )
        except httpx.HTTPError:
            raise RecordingError(
                503, "auth_unavailable", "Account verification is unavailable."
            ) from None
        if response.status_code in (400, 401, 403):
            raise auth_error()
        if response.status_code != 200:
            raise RecordingError(503, "auth_unavailable", "Account verification is unavailable.")
        try:
            user = response.json()
            encoded = token.split(".")[1]
            claims = json.loads(base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4)))
            expiry, issued = claims["exp"], claims["iat"]
            if (
                not isinstance(expiry, (int, float))
                or isinstance(expiry, bool)
                or not isinstance(issued, (int, float))
                or isinstance(issued, bool)
                or not math.isfinite(expiry)
                or not math.isfinite(issued)
                or expiry <= time.time()
                or issued > time.time() + 30
                or issued >= expiry
                or claims.get("iss") != self.settings.issuer
                or claims.get("aud") != "authenticated"
                or claims.get("role") != "authenticated"
                or claims.get("is_anonymous") is not False
                or user.get("is_anonymous") is not False
                or not user.get("email_confirmed_at")
                or UUID(claims["sub"]) != UUID(user["id"])
            ):
                raise ValueError
            if "nbf" in claims and (
                not isinstance(claims["nbf"], (int, float))
                or isinstance(claims["nbf"], bool)
                or not math.isfinite(claims["nbf"])
                or claims["nbf"] > time.time()
            ):
                raise ValueError
            return Identity(UUID(user["id"]), token, expiry)
        except (ValueError, TypeError, KeyError, AttributeError):
            raise auth_error() from None

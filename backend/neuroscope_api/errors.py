class RecordingError(Exception):
    """Only fixed, non-sensitive messages may cross the API boundary."""

    def __init__(self, status: int, code: str, message: str):
        super().__init__(message)
        self.status, self.code, self.message = status, code, message


def invalid():
    return RecordingError(422, "invalid_edf", "Invalid or corrupted EDF recording.")


def unsupported():
    return RecordingError(
        422, "unsupported_edf", "Unsupported EDF structure, calibration, or channel layout."
    )

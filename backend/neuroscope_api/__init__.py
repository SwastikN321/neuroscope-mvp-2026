"""Process-local scientific configuration: no user MNE preferences or log output."""

import os

# Must precede MNE import. MNE cleans its temporary config directory at process exit.
os.environ["MNE_DONTWRITE_HOME"] = "true"
os.environ["MNE_LOGGING_LEVEL"] = "CRITICAL"

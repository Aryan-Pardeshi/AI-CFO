"""Domain errors for the code-first statement pipeline."""


class StatementValidationError(ValueError):
    """Raised when a statement cannot be safely interpreted."""


class StatementNotFoundError(LookupError):
    """Raised when a statement job does not exist for the authenticated user."""


class StatementConflictError(Exception):
    """Raised when a request conflicts with the job's current state."""


class StatementUpstreamError(Exception):
    """Raised when S3 (or another AWS dependency) could not serve the request."""

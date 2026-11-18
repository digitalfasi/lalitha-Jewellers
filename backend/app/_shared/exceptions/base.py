from typing import Optional

from fastapi import status


class AppException(Exception):
    """Base for every error the API returns on purpose."""

    def __init__(self, message: str = "An error occurred", code: str = "SERVER_ERROR",
                 status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR):
        super().__init__(message)
        self.message = message
        self.code = code
        self.status_code = status_code


class ValidationException(AppException):
    def __init__(self, message: str = "Validation failed", field: Optional[str] = None):
        super().__init__(message, "VALIDATION_ERROR", status.HTTP_422_UNPROCESSABLE_ENTITY)
        self.field = field


class NotFoundException(AppException):
    def __init__(self, message: str = "Not found"):
        super().__init__(message, "NOT_FOUND", status.HTTP_404_NOT_FOUND)


class ConflictException(AppException):
    def __init__(self, message: str = "Conflict"):
        super().__init__(message, "CONFLICT", status.HTTP_409_CONFLICT)


class UnauthorizedException(AppException):
    def __init__(self, message: str = "Please sign in."):
        super().__init__(message, "UNAUTHORIZED", status.HTTP_401_UNAUTHORIZED)


class ForbiddenException(AppException):
    def __init__(self, message: str = "You don't have permission to do this."):
        super().__init__(message, "FORBIDDEN", status.HTTP_403_FORBIDDEN)

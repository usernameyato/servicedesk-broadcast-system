from abc import ABC, abstractmethod
from typing import Any


class BaseCRQModel(ABC):
    """Abstract base class for CRQ models."""

    @abstractmethod
    def has_attachments_support(self) -> bool:
        """Check if this model supports attachments."""
        pass

    @abstractmethod
    def get_attachments(self) -> list[Any]:
        """Get attachments for this CRQ."""
        pass

    @abstractmethod
    def to_dict(self, include_attachments: bool = False) -> dict[str, Any]:
        """Convert model instance to dictionary."""
        pass
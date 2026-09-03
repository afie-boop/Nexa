"""
Provider-independent memory interface for Hermes Agent Engine.
"""

from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional


class MemoryInterface(ABC):
    """
    Abstract Base Class for Hermes Agent memory backends (e.g. Obsidian adapter).
    """

    @abstractmethod
    async def save(self, key: str, value: Dict[str, Any]) -> bool:
        pass

    @abstractmethod
    async def get(self, key: str) -> Optional[Dict[str, Any]]:
        pass

    @abstractmethod
    async def search(self, query: str) -> List[Dict[str, Any]]:
        pass

    @abstractmethod
    async def delete(self, key: str) -> bool:
        pass

"""Who is making the current request, for "who did what" records.

The auth dependency sets it once per request; services read it when they save
history (combo events, bills, audits...) so they need no extra argument.
Outside a request (seed scripts, tests calling services) it is empty.
"""
from contextvars import ContextVar
from typing import Optional, Tuple

_actor: ContextVar[Tuple[Optional[str], Optional[str]]] = ContextVar("actor", default=(None, None))


def set_actor(user_id: Optional[str], name: Optional[str]) -> None:
    _actor.set((user_id, name))


def actor_id() -> Optional[str]:
    return _actor.get()[0]


def actor_name() -> Optional[str]:
    return _actor.get()[1]

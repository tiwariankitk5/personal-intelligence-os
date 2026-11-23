"""Dedicated indexing process. Disable PIOS_RAG_WORKER_ENABLED in API replicas when using this."""
import logging
import signal
import threading

from .config import Settings
from .db import migrate, open_pool
from .rag import process_next


def main():
    logging.basicConfig(level=logging.INFO)
    settings = Settings()
    db = open_pool(settings)
    stop = threading.Event()
    signal.signal(signal.SIGTERM, lambda *_: stop.set())
    signal.signal(signal.SIGINT, lambda *_: stop.set())
    try:
        migrate(db)
        while not stop.wait(settings.worker_delay):
            try:
                process_next(db, settings)
            except Exception:
                logging.warning("rag_event=worker_unavailable")
    finally:
        db.close()


if __name__ == "__main__":
    main()

import logging
import sys


class ColorFormatter(logging.Formatter):
    """Color-coded log formatter for console output."""

    COLORS = {
        logging.DEBUG: "\033[36m",     # Cyan
        logging.INFO: "\033[32m",      # Green
        logging.WARNING: "\033[33m",   # Yellow
        logging.ERROR: "\033[31m",     # Red
        logging.CRITICAL: "\033[35m",  # Magenta
    }
    RESET = "\033[0m"

    ICONS = {
        logging.DEBUG: "🔍",
        logging.INFO: "✅",
        logging.WARNING: "⚠️",
        logging.ERROR: "❌",
        logging.CRITICAL: "🔥",
    }

    def format(self, record):
        color = self.COLORS.get(record.levelno, self.RESET)
        icon = self.ICONS.get(record.levelno, "")
        record.msg = f"{color}{icon} {record.msg}{self.RESET}"
        return super().format(record)


def get_logger(name: str) -> logging.Logger:
    """Create a structured, color-coded logger."""
    logger = logging.getLogger(f"nudiscribe.{name}")

    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(
            ColorFormatter("%(asctime)s [%(name)s] %(message)s", datefmt="%H:%M:%S")
        )
        logger.addHandler(handler)
        logger.setLevel(logging.DEBUG)

    return logger

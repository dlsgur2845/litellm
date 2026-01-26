"""
Tests for file logging functionality in litellm._logging
"""
import logging
import os
import sys
import tempfile
from pathlib import Path
from unittest.mock import patch

import pytest


def test_file_logging_handler_added(monkeypatch, tmp_path):
    """Test that file handler is added when LITELLM_LOG_FILE is set"""
    log_file = tmp_path / "test.log"
    
    # Set environment variables before importing
    monkeypatch.setenv("LITELLM_LOG_FILE", str(log_file))
    monkeypatch.setenv("LITELLM_LOG", "INFO")
    
    # Clear any previously imported module
    if "litellm._logging" in sys.modules:
        del sys.modules["litellm._logging"]
    if "litellm" in sys.modules:
        del sys.modules["litellm"]
    
    # Import after setting env vars
    import litellm._logging as logging_module
    
    # Check that file handler was added
    from logging.handlers import TimedRotatingFileHandler
    file_handlers = [
        h for h in logging_module.verbose_logger.handlers 
        if isinstance(h, TimedRotatingFileHandler)
    ]
    
    assert len(file_handlers) > 0, "File handler should be added"
    assert log_file.parent.exists(), "Log directory should be created"


def test_log_file_creation(monkeypatch, tmp_path):
    """Test that log file is actually created when logging"""
    log_file = tmp_path / "app.log"
    
    monkeypatch.setenv("LITELLM_LOG_FILE", str(log_file))
    monkeypatch.setenv("LITELLM_LOG", "INFO")
    
    # Clear modules
    if "litellm._logging" in sys.modules:
        del sys.modules["litellm._logging"]
    if "litellm" in sys.modules:
        del sys.modules["litellm"]
    
    import litellm._logging as logging_module
    
    # Write a log message
    logging_module.verbose_logger.info("Test message")
    
    # Force flush
    for handler in logging_module.verbose_logger.handlers:
        handler.flush()
    
    assert log_file.exists(), "Log file should be created"
    
    # Check content
    content = log_file.read_text()
    assert "Test message" in content


def test_rotation_settings(monkeypatch, tmp_path):
    """Test that rotation settings are correctly applied"""
    log_file = tmp_path / "rotate.log"
    
    monkeypatch.setenv("LITELLM_LOG_FILE", str(log_file))
    monkeypatch.setenv("LITELLM_LOG_ROTATION_DAYS", "2")
    monkeypatch.setenv("LITELLM_LOG_RETENTION_DAYS", "7")
    monkeypatch.setenv("LITELLM_LOG", "INFO")
    
    # Clear modules
    if "litellm._logging" in sys.modules:
        del sys.modules["litellm._logging"]
    if "litellm" in sys.modules:
        del sys.modules["litellm"]
    
    import litellm._logging as logging_module
    from logging.handlers import TimedRotatingFileHandler
    
    # Find file handler
    file_handlers = [
        h for h in logging_module.verbose_logger.handlers 
        if isinstance(h, TimedRotatingFileHandler)
    ]
    
    assert len(file_handlers) > 0
    handler = file_handlers[0]
    
    assert handler.when == 'midnight', "Should rotate at midnight"
    assert handler.interval == 2, "Should rotate every 2 days"
    assert handler.backupCount == 7, "Should keep 7 backups"


def test_json_logging_to_file(monkeypatch, tmp_path):
    """Test JSON logging to file"""
    log_file = tmp_path / "json.log"
    
    monkeypatch.setenv("LITELLM_LOG_FILE", str(log_file))
    monkeypatch.setenv("JSON_LOGS", "True")
    monkeypatch.setenv("LITELLM_LOG", "INFO")
    
    # Clear modules
    if "litellm._logging" in sys.modules:
        del sys.modules["litellm._logging"]
    if "litellm" in sys.modules:
        del sys.modules["litellm"]
    
    import litellm._logging as logging_module
    import json
    
    # Write a log message
    logging_module.verbose_logger.info("JSON test message")
    
    # Force flush
    for handler in logging_module.verbose_logger.handlers:
        handler.flush()
    
    assert log_file.exists()
    
    # Check JSON format
    content = log_file.read_text().strip()
    log_entry = json.loads(content)
    
    assert log_entry["message"] == "JSON test message"
    assert log_entry["level"] == "INFO"
    assert "timestamp" in log_entry


def test_directory_auto_creation(monkeypatch, tmp_path):
    """Test that nested directories are created automatically"""
    log_file = tmp_path / "nested" / "logs" / "app.log"
    
    assert not log_file.parent.exists(), "Directory should not exist initially"
    
    monkeypatch.setenv("LITELLM_LOG_FILE", str(log_file))
    monkeypatch.setenv("LITELLM_LOG", "INFO")
    
    # Clear modules
    if "litellm._logging" in sys.modules:
        del sys.modules["litellm._logging"]
    if "litellm" in sys.modules:
        del sys.modules["litellm"]
    
    import litellm._logging as logging_module
    
    assert log_file.parent.exists(), "Nested directories should be created"


def test_timezone_formatter(monkeypatch, tmp_path):
    """Test that timezone formatter is applied"""
    log_file = tmp_path / "tz.log"
    
    monkeypatch.setenv("LITELLM_LOG_FILE", str(log_file))
    monkeypatch.setenv("LITELLM_LOG_TIMEZONE", "Asia/Seoul")
    monkeypatch.setenv("LITELLM_LOG", "INFO")
    
    # Clear modules
    if "litellm._logging" in sys.modules:
        del sys.modules["litellm._logging"]
    if "litellm" in sys.modules:
        del sys.modules["litellm"]
    
    import litellm._logging as logging_module
    from logging.handlers import TimedRotatingFileHandler
    
    # Find file handler
    file_handlers = [
        h for h in logging_module.verbose_logger.handlers 
        if isinstance(h, TimedRotatingFileHandler)
    ]
    
    assert len(file_handlers) > 0
    handler = file_handlers[0]
    
    # Check formatter type
    formatter = handler.formatter
    assert formatter is not None
    
    # For JSON logs, check JsonFormatter
    # For normal logs, check TimezoneFormatter
    if "JSON_LOGS" in os.environ:
        assert isinstance(formatter, logging_module.JsonFormatter)
    else:
        assert isinstance(formatter, logging_module.TimezoneFormatter)


def test_no_file_logging_when_env_not_set(monkeypatch):
    """Test that no file handler is added when LITELLM_LOG_FILE is not set"""
    # Make sure env var is not set
    monkeypatch.delenv("LITELLM_LOG_FILE", raising=False)
    
    # Clear modules
    if "litellm._logging" in sys.modules:
        del sys.modules["litellm._logging"]
    if "litellm" in sys.modules:
        del sys.modules["litellm"]
    
    import litellm._logging as logging_module
    from logging.handlers import TimedRotatingFileHandler
    
    # Check that no file handler was added
    file_handlers = [
        h for h in logging_module.verbose_logger.handlers 
        if isinstance(h, TimedRotatingFileHandler)
    ]
    
    assert len(file_handlers) == 0, "No file handler should be added without LITELLM_LOG_FILE"


def test_error_handling_invalid_path(monkeypatch, capsys):
    """Test that invalid file path doesn't crash the application"""
    # Try to use an invalid path
    monkeypatch.setenv("LITELLM_LOG_FILE", "/invalid/path/that/does/not/exist/app.log")
    monkeypatch.setenv("LITELLM_LOG", "INFO")
    
    # Clear modules
    if "litellm._logging" in sys.modules:
        del sys.modules["litellm._logging"]
    if "litellm" in sys.modules:
        del sys.modules["litellm"]
    
    # Should not raise an exception
    try:
        import litellm._logging as logging_module
        # If directory creation works, this is fine
        # If it fails, we should still be able to import
    except Exception as e:
        pytest.fail(f"Import should not fail even with invalid path: {e}")

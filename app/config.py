import os
import json
from dotenv import load_dotenv
from pathlib import Path
from datetime import timedelta

dotenv_path = os.path.join(os.path.dirname(__file__), "../instance/.env")
load_dotenv(dotenv_path)

def get_project_dir() -> Path:
    current_path = Path(__file__).resolve()
    for parent in current_path.parents:
        if (parent / ".git").exists():
            return parent
    return current_path.parent

def load_logging_config():
    parent = get_project_dir()
    config_path = parent / "instance" / "logger.json"
    try:
        with open(config_path, 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        return {
            "version": 1,
            "disable_existing_loggers": False,
            "formatters": {
                "default": {
                    "format": "%(asctime)s - %(levelname)s - %(message)s"
                }
            },
            "handlers": {
                "console": {
                    "class": "logging.StreamHandler",
                    "formatter": "default"
                }
            },
            "root": {
                "level": "INFO",
                "handlers": ["console"]
            }
        }

class Config:
    parent = get_project_dir()

    # Конфигурация приложения
    SECRET_KEY = os.getenv("SECRET_KEY")
    UPLOAD_FOLDER = os.path.join(parent, os.getenv("UPLOAD_FOLDER"))
    LOGGING_CONF = load_logging_config()
    PERMANENT_SESSION_LIFETIME=timedelta(hours=2)
    REDIS_URL = os.getenv("REDIS_URL", "redis://:S3cure_Redis_Pass@172.28.83.219:6379/0")

    # Конфигурация для подключения к базам данных:
    SQLALCHEMY_DATABASE_URI = os.getenv("DATABASE_URL")
    SQLALCHEMY_BINDS = {
        'itsm': os.getenv("ITSM_ORA_DB_URL")
    }
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # Конфигурация для подключения к Active Directory
    AD_SERVER = os.getenv("AD_SERVER")
    AD_DOMAIN = os.getenv("AD_DOMAIN")
    AD_BASE_DN = os.getenv("AD_BASE_DN")
    AD_USER_SSL = os.getenv("AD_USER_SSL")
    AD_ADMIN_USERNAME = os.getenv("AD_ADMIN_USERNAME")
    AD_ADMIN_PASSWORD = os.getenv("AD_ADMIN_PASSWORD")

    # Конфигурация для подключения к mail server:
    MAIL_SERVER = os.getenv("MAIL_SERVER")
    MAIL_PORT = int(os.getenv("MAIL_PORT", "25"))
    MAIL_USE_TLS = os.getenv("MAIL_USE_TLS") == "True"
    MAIL_USE_SSL = os.getenv("MAIL_USE_SSL") == "True"
    MAIL_USERNAME = os.getenv("MAIL_USERNAME")
    MAIL_DEFAULT_SENDER = os.getenv("MAIL_DEFAULT_SENDER")

    # Конфигурация для подключения к SMS Center:
    SMPP_HOST = os.getenv("SMPP_HOST")
    SMPP_PORT = os.getenv("SMPP_PORT")
    SMPP_SYSTEM_ID = os.getenv("SMPP_SYSTEM_ID")
    SMPP_PASSWORD = os.getenv("SMPP_PASSWORD")
    SMPP_SENDER = os.getenv("SMPP_SENDER")
    SMPP_PART_DELAY = float(os.getenv("SMPP_PART_DELAY", "0.3"))
    SMPP_RECIPIENT_DELAY = float(os.getenv("SMPP_RECIPIENT_DELAY", "0.5"))

    # Конфигурация для интеграции Microsoft Graph API:
    MS_LOGIN_URL = os.getenv("MS_LOGIN_URL")
    MS_GRAPH_URL = os.getenv("MS_GRAPH_URL")
    MS_GRAPH_API_TENANT_ID = os.getenv("MS_GRAPH_API_TENANT_ID")
    MS_GRAPH_API_CLIENT_ID = os.getenv("MS_GRAPH_API_CLIENT_ID")
    MS_GRAPH_API_CLIENT_SECRET = os.getenv("MS_GRAPH_API_CLIENT_SECRET")
    MS_GRAPH_API_USERNAME = os.getenv("MS_GRAPH_API_USERNAME")
    MS_GRAPH_API_PASSWORD = os.getenv("MS_GRAPH_API_PASSWORD")

class DevelopmentConfig(Config):
    DEBUG = True
    TESTING = False
    ENV = 'development'

class ProductionConfig(Config):
    DEBUG = False
    TESTING = False
    ENV = 'production'
    
    # SESSION_COOKIE_SECURE = True
    # SESSION_COOKIE_HTTPONLY = True
    # PERMANENT_SESSION_LIFETIME = 1800

def get_config():
    env = os.getenv("FLASK_ENV", "development")
    config_map = {
        "development": DevelopmentConfig,
        "production": ProductionConfig
    }
    return config_map.get(env, DevelopmentConfig)
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager
from flask_mail import Mail
from flask_socketio import SocketIO

from app.core.monitoring.metrics import PrometheusMetrics
from app.core.monitoring.middleware import MetricsMiddleware
from app.core.services.notification import NotificationTaskManager
from app.core.services.crq_lock import CRQLockManager


db = SQLAlchemy()
mail = Mail()
login_manager = LoginManager()
notification_manager = NotificationTaskManager()
socketio = SocketIO()

prometheus_metrics = PrometheusMetrics()
metrics_middleware = MetricsMiddleware()

lock_manager = CRQLockManager()

login_manager.login_view = "auth.login"
login_manager.login_message = "Пожалуйста, войдите, чтобы получить доступ к этой странице."
login_manager.login_message_category = "info"
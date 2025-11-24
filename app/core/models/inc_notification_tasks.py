from datetime import datetime

from app.core.models.mixins import CRUDMixin, QueryMixin
from app.extensions import db


class IncidentsNotificationTasks(db.Model, CRUDMixin, QueryMixin):
    """Модель таблицы sbs_inc_notification_tasks БД service_monitoring"""

    __tablename__ = 'sbs_inc_notification_tasks'
    __table_args__ = {'schema': 'grafana'}

    task_id = db.Column("task_id", db.String(36), primary_key=True, nullable=False)
    inc_number = db.Column("inc_number", db.String(50), nullable=False)
    notification_type = db.Column("notification_type", db.String(20), nullable=False)
    total_recipients = db.Column("total_recipients", db.Integer, nullable=False, default=0)
    successful_sends = db.Column("successful_sends", db.Integer, nullable=False, default=0)
    failed_sends = db.Column("failed_sends", db.Integer, nullable=False, default=0)
    deferred_sends = db.Column("deferred_sends", db.Integer, nullable=False, default=0)
    status = db.Column("status", db.String(20), nullable=False)
    created_at = db.Column("created_at", db.DateTime, nullable=False, default=datetime.now)
    started_at = db.Column("started_at", db.DateTime, nullable=True)
    completed_at = db.Column("completed_at", db.DateTime, nullable=True)
    processing_duration_seconds = db.Column("processing_duration_seconds", db.Integer, nullable=True)
    created_by = db.Column("created_by", db.String(100), nullable=True)
    operator_ip = db.Column("operator_ip", db.String(45), nullable=True)
    error_message = db.Column("error_message", db.Text, nullable=True)
    message = db.Column("message", db.Text, nullable=True)

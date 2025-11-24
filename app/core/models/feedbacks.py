from datetime import datetime

from app.core.models.mixins import CRUDMixin, QueryMixin
from app.extensions import db


class Feedbacks(db.Model, CRUDMixin, QueryMixin):
    """Модель таблицы sbs_feedback БД service_monitoring."""

    __tablename__ = "sbs_feedback"
    __table_args__ = {"schema": "grafana"}

    feedback_id = db.Column("id", db.Integer, primary_key=True, nullable=False, autoincrement=True)
    username = db.Column("username", db.String(100), nullable=False)
    email = db.Column("email", db.String(120), nullable=False)
    message = db.Column("message", db.Text, nullable=False)
    timestamp = db.Column("timestamp", db.DateTime, nullable=False, default=datetime.now)
    response = db.Column("response", db.Text, nullable=True)
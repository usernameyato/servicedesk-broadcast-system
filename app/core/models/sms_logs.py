from datetime import datetime

from app.core.models.mixins import CRUDMixin, QueryMixin
from app.extensions import db


class SMSLog(db.Model, CRUDMixin, QueryMixin):
    """Модель таблицы sbs_sms_logs БД service_monitoring."""

    __tablename__ = 'sbs_sms_logs'
    __table_args__ = {'schema': 'grafana'}

    id = db.Column("id", db.Integer, primary_key=True, autoincrement=True)
    inc_id = db.Column("inc_id", db.String(50), nullable=False)
    sms_text = db.Column("text", db.String(50), nullable=False)
    ad_phone_number = db.Column("phone_number", db.String(50), nullable=False)
    sms_status = db.Column("status", db.String(50), nullable=False)
    send_date = db.Column("send_date", db.DateTime, nullable=False, default=datetime.now)
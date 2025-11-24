from typing import Any

from app.core.models.mixins import CRUDMixin, QueryMixin
from app.extensions import db


class CRQAttachments(db.Model, CRUDMixin, QueryMixin):
    """Модель таблицы sbs_crq_attachment БД service_monitoring."""

    __tablename__ = "sbs_crq_attachment"
    __table_args__ = {"schema": "grafana"}

    id = db.Column("id", db.Integer, primary_key=True, nullable=False)
    crq_number = db.Column("crq_id", db.Integer, db.ForeignKey('grafana.sbs_crq_data.id', ondelete='CASCADE'), nullable=True)
    original_filename = db.Column("original_filename", db.String(255), nullable=False)
    encoded_filename = db.Column("encoded_filename", db.String(255), nullable=False)
    upload_date = db.Column("upload_date", db.DateTime, nullable=False)

    def __init__(self, **kwargs):
        """Инициализация с поддержкой keyword arguments для PyCharm"""
        super().__init__(**kwargs)

    def to_dict(self) -> dict[str, Any]:
        """Конвертация инстанса модели в словарь."""
        return {
            'id': self.id,
            'crq_number': self.crq_number,
            'original_filename': self.original_filename,
            'encoded_filename': self.encoded_filename,
            'upload_date': self.upload_date.isoformat() if self.upload_date else None,
            'size': None
        }
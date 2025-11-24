from typing import Any

from app.core.models.mixins import CRUDMixin, QueryMixin
from app.extensions import db


class CRQProcessed(db.Model, CRUDMixin, QueryMixin):
    """Модель таблицы sbs_crq_data БД service_monitoring."""

    __tablename__ = "sbs_crq_data"
    __table_args__ = {"schema": "grafana"}

    id = db.Column("id", db.Integer, primary_key=True, nullable=False)
    crq_number = db.Column("crq_number", db.String(255), unique=True, nullable=False)
    direction = db.Column("service", db.String(255), nullable=False)
    impact_status = db.Column("impact", db.String(100), nullable=False)
    impact_details = db.Column("impact_details", db.Text, nullable=True)
    start_date = db.Column("start_date", db.DateTime, nullable=False)
    end_date = db.Column("end_date", db.DateTime, nullable=False)
    short_description = db.Column("short_description", db.Text, nullable=False)
    detailed_description = db.Column("detailed_description", db.Text, nullable=False)
    initiator = db.Column("initiator", db.String(100), nullable=False)
    status = db.Column("status", db.String(50), nullable=False)
    sub_type = db.Column("email_type", db.String(50), nullable=False)
    cause = db.Column("cause", db.Text, nullable=False)
    sent_date = db.Column("sent_date", db.DateTime, nullable=False)
    comments = db.Column("comments", db.Text, nullable=False)
    crq_type = db.Column("work_type", db.Text, nullable=False)
    attachments = db.relationship('CRQAttachments', backref='crq', lazy=True, cascade='all, delete-orphan')

    def to_dict(self, include_attachments: bool = True) -> dict[str, Any]:
        """Convert model instance to dictionary."""
        result = {
            'id': self.id,
            'crq_number': self.crq_number,
            'direction': self.direction,
            'impact_status': self.impact_status,
            'impact_details': self.impact_details,
            'start_date': self.start_date.isoformat() if self.start_date else None,
            'end_date': self.end_date.isoformat() if self.end_date else None,
            'short_description': self.short_description,
            'detailed_description': self.detailed_description,
            'initiator': self.initiator,
            'status': self.status,
            'sub_type': self.sub_type,
            'cause': self.cause,
            'sent_date': self.sent_date.isoformat() if self.sent_date else None,
            'comments': self.comments,
            'crq_type': self.crq_type,
        }

        if include_attachments:
            result['attachments'] = [attachment.to_dict() for attachment in self.attachments]

        return result

    def has_attachments_support(self) -> bool:
        """Check if this model supports attachments."""
        return hasattr(self, 'attachments')
from datetime import datetime

from app.core.models.mixins import CRUDMixin, QueryMixin
from app.extensions import db


class PartnerGroups(db.Model, CRUDMixin, QueryMixin):
    """Модель таблицы sbs_partners_groups БД service_monitoring."""

    __tablename__ = 'sbs_partners_groups'
    __table_args__ = {'schema': 'grafana'}

    partner_group_id = db.Column("id", db.Integer, primary_key=True, nullable=False)
    partner_group_name = db.Column("groupname", db.String(100), unique=True, nullable=False)
    created_at = db.Column("created_at", db.DateTime, nullable=False)
from app.core.models.mixins import CRUDMixin, QueryMixin
from app.extensions import db


class Subscriptions(db.Model, CRUDMixin, QueryMixin):
    """Модель таблицы sbs_subscriptions БД service_monitoring."""

    __tablename__ = "sbs_subscriptions"
    __table_args__ = {"schema": "grafana"}

    sub_id = db.Column("id", db.Integer, primary_key=True, nullable=False)
    sub_name = db.Column("name", db.String(50), nullable=False)
    sub_description = db.Column("description", db.String(255), nullable=False)

    @property
    def id(self):
        return self.user_id
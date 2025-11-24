from flask_login import UserMixin
from sqlalchemy.ext.hybrid import hybrid_property
from sqlalchemy.dialects.postgresql import JSONB

from app.core.models.mixins import CRUDMixin, QueryMixin
from app.extensions import db


class Users(db.Model, UserMixin, CRUDMixin, QueryMixin):
    """Модель таблицы sbs_users БД service_monitoring."""

    __tablename__ = "sbs_users"
    __table_args__ = {"schema": "grafana"}

    id = db.Column("id", db.Integer, primary_key=True, nullable=False, autoincrement=True)
    user_login = db.Column("user_login", db.String(20), unique=True, nullable=False)
    user_email = db.Column("user_email", db.String(120), unique=True, nullable=False)
    subscription_settings = db.Column("subscriptions", JSONB, nullable=False)
    role = db.Column("role", db.String(50), nullable=False, default="user")
    ad_phone_number = db.Column("ad_phone_number", db.String(50), nullable=False)
    night_notifications_enabled = db.Column("off_hours", db.String(50), nullable=False)

    @hybrid_property
    def subscriptions(self) -> dict[str, list]:
        """Получение значения столбца subscriptions."""
        return self.subscription_settings or {"maintenance_subs": [], "incidents_subs": []}
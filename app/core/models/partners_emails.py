from app.core.models.mixins import CRUDMixin, QueryMixin
from app.extensions import db


class PartnersEmails(db.Model, CRUDMixin, QueryMixin):
    """Модель таблицы sbs_partners БД service_monitoring."""

    __tablename__ = 'sbs_partners'
    __table_args__ = {'schema': 'grafana'}

    partner_id = db.Column("id", db.Integer, primary_key=True, nullable=False)
    partner_email = db.Column("email", db.String(100), nullable=False)
    partner_group_id = db.Column("group_id", db.Integer, db.ForeignKey('grafana.sbs_partners_groups.id'), nullable=False)
    partner_group_name = db.relationship('PartnerGroups', backref=db.backref('partners', lazy=True, cascade='all, delete-orphan'), foreign_keys=[partner_group_id])

    @property
    def id(self):
        return self.partner_id

    @property
    def user_email(self):
        return self.partner_email
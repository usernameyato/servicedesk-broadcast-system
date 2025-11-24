from datetime import datetime
from typing import Any
from sqlalchemy.ext.hybrid import hybrid_property

from app.core.models.mixins import CRUDMixin, QueryMixin
from app.extensions import db


class CRQSource(db.Model, CRUDMixin, QueryMixin):
    """Модель таблицы T2318 БД ITSM."""

    __bind_key__ = "itsm"
    __tablename__ = "T2318"
    __table_args__ = {"schema": "ARADM"}

    crq_number = db.Column("C1000000182", db.String(15), primary_key = True, nullable=False)
    direction_raw = db.Column("C536870943", db.Numeric, nullable=False)
    impact_status_raw = db.Column("C536870992", db.Numeric, nullable=False)
    td_impact_on_service_details = db.Column("C536870937", db.Text, nullable=True)
    it_impact_on_client_details = db.Column("C700100201", db.Text, nullable=True)
    it_impact_on_user_details = db.Column("C700100200", db.Text, nullable=True)
    start_date_unix = db.Column("C536871024", db.BigInteger, nullable=False)
    end_date_unix = db.Column("C536871025", db.BigInteger, nullable=False)
    short_description = db.Column("C1000000000", db.String(500), nullable=False)
    detailed_description = db.Column("C1000000151", db.Text, nullable=False)
    initiator = db.Column("C536870952", db.String(255), nullable=False)
    cause = db.Column("C536870946", db.Text, nullable=False)

    @hybrid_property
    def direction(self) -> str:
        """
        Конвертация сырых данных поля C536870943 в читаемый формат.
        C536870943 соответствует чек-боксу "Дирекция" в форме CRQ в синей консоли.

        Return:
            Выбранное значение поля, или "Техническая Дирекция" по-умолчанию.
        """
        mapping = {
            0: "Техническая Дирекция",
            1: "Информационные технологии",
            2: "В2В",
            3: "B2C"
        }
        return mapping.get(self.direction_raw, "Техническая Дирекция")

    @hybrid_property
    def impact_status(self) -> str:
        """
        Конвертация сырых данных поля C536870992 в читаемый формат.
        C536870992 соответствует чек-боксу "Влияние на сервис" в форме CRQ в синей консоли.

        Return:
            Выбранное значение поля, или "Без прерывания" по-умолчанию.
        """
        mapping = {
            0: "Без прерывания",
            1: "С прерыванием"
        }
        return mapping.get(self.impact_status_raw, "Без прерывания")

    @hybrid_property
    def start_date(self) -> datetime | None:
        """
        Конвертация сырых данных поля C536871024 в читаемый формат.
        C536871024 соответствует полю "Дата начала" в форме CRQ в синей консоли.

        Returns:
            Значение даты/времени, или None в случае ошибки.
        """
        if self.start_date_unix:
            return datetime.fromtimestamp(self.start_date_unix)
        return None

    @hybrid_property
    def end_date(self) -> datetime | None:
        """
        Конвертация сырых данных поля C536871025 в читаемый формат.
        C536871025 соответствует полю "Дата окончания" в форме CRQ в синей консоли.

        Returns:
            Значение даты/времени, или None в случае ошибки.
        """
        if self.end_date_unix:
            return datetime.fromtimestamp(self.end_date_unix)
        return None

    def to_dict(self) -> dict[str, Any]:
        """Конвертация инстанса модели в словарь."""
        result = {
            key: value for key, value in self.__dict__.items()
            if not key.startswith('_')
        }

        result['direction'] = self.direction
        result["impact_status"] = self.impact_status
        result["start_date"] = self.start_date
        result["end_date"] = self.end_date

        return result

    def has_attachments_support(self) -> bool:
        """Check if this model supports attachments."""
        return hasattr(self, 'attachments')
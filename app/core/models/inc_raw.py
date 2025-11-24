from datetime import datetime
from typing import Optional
from sqlalchemy.ext.hybrid import hybrid_property

from app.core.models.mixins import CRUDMixin, QueryMixin
from app.extensions import db


class Incidents(db.Model, CRUDMixin, QueryMixin):
    """Модель таблицы T1447 БД ITSM."""

    __bind_key__ = "itsm"
    __tablename__ = "T1447"
    __table_args__ = {"schema": "ARADM"}

    inc_id = db.Column("C1000000161", db.String(15), nullable=False, primary_key=True)
    priority_raw = db.Column("C536870963", db.Numeric, nullable=True)
    status_raw = db.Column("C7", db.Numeric, nullable=True)
    short_description = db.Column("C1000000000", db.String(1000), nullable=True)
    detailed_description = db.Column("C1000000151", db.Text, nullable=True)
    service = db.Column("C303497300", db.String(255), nullable=True)
    ci = db.Column("C303497400", db.String(255), nullable=True)
    creation_date_unix = db.Column("C3", db.BigInteger, nullable=True)
    solution_date_unix = db.Column("C536871032", db.BigInteger, nullable=True)
    accident_start_date_unix = db.Column("C536870937", db.BigInteger, nullable=True)
    accident_end_date_unix = db.Column("C536870938", db.BigInteger, nullable=True)

    @hybrid_property
    def priority(self) -> int:
        """
        Конвертация сырых данных поля C536870963 в читаемый формат.
        C536870963 соответствует полю "Приоритет" в форме INC в синей консоли.

        Return:
            Выбранное значение поля, или "5" по-умолчанию.
        """
        mapping = {
            4: 5,
            3: 4,
            2: 3,
            1: 2,
            0: 1
        }
        return mapping.get(self.priority_raw, 5)

    @hybrid_property
    def status(self) -> str:
        """
        Конвертация сырых данных поля C7 в читаемый формат.
        C7 соответствует полю "Статус" в форме INC в синей консоли.

        Return:
            Выбранное значение поля, или "Назначен" по-умолчанию.
        """
        mapping = {
            0: "Новый",
            1: "Назначен",
            2: "Выполняется",
            3: "В ожидании",
            4: "Решен",
            5: "Закрыт",
            6: "Отменен"
        }
        return mapping.get(self.status_raw, "Назначен")

    @hybrid_property
    def creation_date(self) -> Optional[datetime]:
        """
        Конвертация сырых данных поля C1000000560 в читаемый формат.
        C1000000560 соответствует полю "Дата создания" в форме INC в синей консоли.

        Returns:
            Значение даты/времени, или None в случае ошибки.
        """
        if self.creation_date_unix:
            return datetime.fromtimestamp(self.creation_date_unix)
        return None

    @hybrid_property
    def solution_date(self) -> Optional[datetime]:
        """
        Конвертация сырых данных поля C1000000563 в читаемый формат.
        C1000000563 соответствует полю "Дата решения" в форме INC в синей консоли.

        Returns:
            Значение даты/времени, или None в случае ошибки.
        """
        if self.solution_date_unix:
            return datetime.fromtimestamp(self.solution_date_unix)
        return None

    @hybrid_property
    def accident_start_date(self) -> Optional[datetime]:
        """
        Конвертация сырых данных поля C536870937 в читаемый формат.
        C536870937 соответствует полю "Дата и время начала аварии" в форме INC в синей консоли.

        Returns:
            Значение даты/времени, или None в случае ошибки.
        """
        if self.accident_start_date_unix:
            return datetime.fromtimestamp(self.accident_start_date_unix)
        return None

    @hybrid_property
    def accident_end_date(self) -> Optional[datetime]:
        """
        Конвертация сырых данных поля C536870938 в читаемый формат.
        C536870938 соответствует полю "Дата и время окончания аварии" в форме INC в синей консоли.

        Returns:
            Значение даты/времени, или None в случае ошибки.
        """
        if self.accident_end_date_unix:
            return datetime.fromtimestamp(self.accident_end_date_unix)
        return None
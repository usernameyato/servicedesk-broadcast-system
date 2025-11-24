from typing import TypeVar, Any, Self
from sqlalchemy import inspect
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import DeclarativeBase

from app.extensions import db

ModelType = TypeVar('ModelType', bound=DeclarativeBase)

class CRUDMixin:
    """Инстанс Mixin позволяет выполнять простые базовые операции CRUD (Insert, Select, Update, Delete)."""

    @classmethod
    def create(cls: type[ModelType], **kwargs: Any) -> ModelType:
        """Добавить новую запись в БД с указанными параметрами."""
        instance = cls(**kwargs)
        return instance.save()

    @classmethod
    def get_all(cls: type[ModelType]) -> list[ModelType]:
        """Получить все записи из таблицы."""
        return db.session.execute(db.select(cls)).scalars().all()

    def save(self) -> Self:
        """Добавить новую запись в таблицу."""
        try:
            db.session.add(self)
            db.session.commit()
            return self
        except SQLAlchemyError:
            db.session.rollback()
            raise

    def update(self, **kwargs: Any) -> Self:
        """Частичное обновление записи."""
        try:
            for key, value in kwargs.items():
                if hasattr(self, key):
                    setattr(self, key, value)
            db.session.commit()
            return self
        except SQLAlchemyError:
            db.session.rollback()
            raise

    def delete(self) -> None:
        """Удалить запись из таблицы."""
        try:
            db.session.delete(self)
            db.session.commit()
        except SQLAlchemyError:
            db.session.rollback()
            raise

class QueryMixin:
    """Инстанс позволяет производить сложные операции с таблицами."""

    @classmethod
    def get_all_ordered(cls: type[ModelType],
                        order_by: str | None = None,
                        order_direction: str | None ='asc') -> list[ModelType]:
        """Получить все записи из таблицы с сортировкой."""
        query = db.select(cls)

        if order_by:
            field = getattr(cls, order_by)
            if order_direction and order_direction.lower() == 'desc':
                query = query.order_by(field.desc())
            else:
                query = query.order_by(field.asc())

        return db.session.execute(query).scalars().all()

    @classmethod
    def get_all_by_filter(cls: type[ModelType], **kwargs: Any) -> list[ModelType]:
        """Получить все записи по любым параметрам с сортировкой."""
        return db.session.execute(db.select(cls).filter_by(**kwargs)).scalars().all()
    
    @classmethod
    def get_all_by_filter_ordered(cls: type[ModelType],
                                  order_by: str | None = None,
                                  order_direction: str | None ='asc',
                                  **kwargs: Any) -> list[ModelType]:
        """Получить все записи по любым параметрам с сортировкой."""
        query = db.select(cls).filter_by(**kwargs)

        if order_by:
            field = getattr(cls, order_by)
            if order_direction and order_direction.lower() == 'desc':
                query = query.order_by(field.desc())
            else:
                query = query.order_by(field.asc())

        return db.session.execute(query).scalars().all()

    @classmethod
    def get_by_filter(cls: type[ModelType], **kwargs: Any) -> ModelType | None:
        """Получить первую запись по любым параметрам с сортировкой."""
        return db.session.execute(db.select(cls).filter_by(**kwargs)).scalar_one_or_none()

    @classmethod
    def get_by_id(cls: type[ModelType], record_id: Any)  -> ModelType | None:
        """Получить запись по ID."""
        pk_column = inspect(cls).primary_key[0]
        return db.session.execute(db.select(cls).where(pk_column == record_id)).scalar_one_or_none()
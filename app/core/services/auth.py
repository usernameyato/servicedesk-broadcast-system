import logging
from flask import abort, current_app
from flask_login import current_user
from sqlalchemy.exc import SQLAlchemyError
from functools import wraps
from typing import Callable, Any, TypeVar

from app.extensions import login_manager
from app.core.models.users import Users
from app.core.monitoring.decorators import track_operation
from app.core.services.ldap import LDAPConnector, LDAPException
from app.core.utils.helpers import format_phone_to_standard

F = TypeVar('F', bound=Callable[..., Any])


class AuthService:
    """Вспомогательный класс аутентификации пользователя."""

    @track_operation("user-search", "auth")
    @staticmethod
    def get_user_by_id(user_id: int) -> Users | None:
        """
        Поиск пользователя в базе по ID.

        Args:
            user_id: ID пользователя в базе данных

        Returns:
            Данные о пользователе в виде инстанса модели Users
        """
        return Users.get_by_id(int(user_id))

    @staticmethod
    def user_has_role(user: Users, required_role: str) -> bool:
        """
        Проверка наличия у пользователя необходимой роли.

        Args:
            user: Инстанс модели Users
            required_role: Роль, необходимая для обработки запроса

        Returns:
            True, если роль соответствует. False, если роль несоответствует
        """
        return user.role == required_role

    @track_operation("user-authenticate", "auth")
    @staticmethod
    def authenticate_user(username: str, password: str) -> Users | None:
        """
        Метод аутентификации пользователя.

        Args:
            username: Логин пользователя
            password: Пароль пользователя

        Returns:
            Соответствующий инстанс модели Users
        """
        try:
            with LDAPConnector(username, password):
                return AuthService.validate_user(username)
        except LDAPException as e:
            logging.error(f"Ошибка LDAP аутентификации пользователя {username}: {e}")
            return None
        except Exception as e:
            logging.error(f"Неизвестная ошибка аутентификации пользователя: {e}")

    @track_operation("user-validate", "auth")
    @staticmethod
    def validate_user(user_login: str) -> Users | None:
        """
        Метод поиска пользователя в БД и его создания, в случае отсутствия.

        Args:
            user_login: Логин пользователя

        Returns:
            Соответствующий инстанс модели Users
        """
        try:
            user = Users.get_by_filter(user_login=user_login)
            if user:
                return user

            return AuthService._create_user_from_ad(user_login)

        except Exception as e:
            logging.error(f"Ошибка валидации пользователя: {e}")
            return None

    @track_operation("user-create", "auth")
    @staticmethod
    def _create_user_from_ad(user_login: str) -> Users | None:
        """
        Метод создания пользователя на основе данных из Active Directory.

        Args:
            user_login: Логин пользователя

        Returns:
            Созданный инстанс модели Users
        """
        try:
            admin_username = current_app.config.get("AD_ADMIN_USERNAME")
            admin_password = current_app.config.get("AD_ADMIN_PASSWORD")

            with LDAPConnector(admin_username, admin_password) as admin_ldap:
                user_ad_info = admin_ldap.get_user_info(user_login)

            if not user_ad_info or user_ad_info == "empty":
                logging.error(f"Пользователь не найден в Active Directory: {user_login}")
                return None

            if not user_ad_info.get('is_active', True):
                logging.warning(f"Пользователь {user_login} отключен.")
                return None

            user = Users.create(
                user_login=user_login,
                user_email=f"{user_login}@beeline.kz",
                subscription_settings={"incidents_subs": [], "maintenance_subs": []},
                role="user",
                ad_phone_number=format_phone_to_standard(user_ad_info.get('mobile_phone')),
                night_notifications_enabled="1"
            )

            logging.info(f"Пользователь {user_login} успешно создан.")
            return user
        except LDAPException as e:
            logging.error(f"Ошибка аутентификации администратора: {e}")
            return None
        except SQLAlchemyError as e:
            logging.error(f"Ошибка базы данных при создании пользователя: {e}")
            return None
        except Exception as e:
            logging.error(f"Неизвестная ошибка создания пользователя: {e}")
            return None


@login_manager.user_loader
def load_user(user_id: int) -> Users | None:
    """
    Метод загрузки пользователя для менеджера Flask-login.

    Args:
        user_id: ID пользователя из БД

    Returns:
        Инстанс модели пользователя.
    """
    return AuthService.get_user_by_id(user_id)

def role_required(role: str):
    def decorator(func: F) -> F:
        @wraps(func)
        def decorated_function(*args, **kwargs):
            if not AuthService.user_has_role(current_user, role):
                logging.warning(f"Доступ запрещен для пользователя {current_user} с ролью {role}",)
                abort(403)
            return func(*args, **kwargs)
        return decorated_function
    return decorator
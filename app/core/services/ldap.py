from flask import current_app
from ldap3 import Server, Connection, SUBTREE
from ldap3.core.exceptions import LDAPException
from typing import Any
import logging


class LDAPConnector:
    """
    Инстанс обработчика команд LDAP.
    Для подключения к AD необходимо использовать контекстный менеджер:

    Args:
        username: Логин пользователя для авторизации.
        password: Пароль пользователя для авторизации.

    Returns:
        Инстанс объекта ldap со статусом подключения к серверу

    Example:
        >>> with LDAPConnector("user@domain", "password") as ldap:
        ...     user_info = ldap.get_user_info("ivanov.i")
        ...     print(user_info["office_phone"])
        "+7 (495) 123-45-67"
    """

    def __init__(self, username: str, password: str):
        """Инициализация инстанса LDAP."""
        self.ad_server = current_app.config.get("AD_SERVER")
        self.ad_domain = current_app.config.get("AD_DOMAIN")
        self.ad_base_dn = current_app.config.get("AD_BASE_DN")
        self.ad_user_ssl = current_app.config.get("AD_USER_SSL")

        self.username = username
        self.password = password
        self.connection = None

    def __enter__(self):
        """
        Точка входа контекстного менеджера.
        Позволяет вызывать инстанс с оператором with().
        """
        try:
            server = Server(self.ad_server, use_ssl=self.ad_user_ssl)
            self.connection = Connection(
                server=server,
                user=f"{self.username}@{self.ad_domain}",
                password=self.password
            )

            if not self.connection.bind():
                raise LDAPException("Не удалось подключиться к LDAP с указанными данными авторизации.")

            logging.info("Подключение LDAP установлено.")
            return self

        except Exception as e:
            raise LDAPException(f"Ошибка подключения LDAP: {e}")

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Точка выхода контекстного менеджера."""
        if self.connection:
            self.connection.unbind()
            logging.info("Подключение LDAP закрыто.")

    def get_user_info(self, login: str) -> dict[str, Any] | None:
        """
        Получение информации о пользователе из AD.

        Args:
            login: Логин пользователя в AD

        Returns:
            Словарь с данными о пользователе

        Example:
            >>> with LDAPConnector("admin", "password") as ldap:
            ...     info = ldap.get_user_info("ivanov.i")
            >>> print(info)
            {
                "office_phone": "+7 (495) 123-45-67",
                "mobile_phone": "+7 (903) 456-78-90",
                "other_phones": ["+7 (495) 987-65-43"],
                "is_active": True
            }
        """
        if not self.connection:
            raise LDAPException("LDAP соединение не установлено.")

        try:
            search_filter = f"(sAMAccountName={login})"
            attributes = ['telephoneNumber', 'mobile', 'otherTelephone', 'userAccountControl']
            self.connection.search(
                search_base=self.ad_base_dn,
                search_filter=search_filter,
                search_scope=SUBTREE,
                attributes=attributes
            )

            if len(self.connection.entries) == 0:
                logging.warning(f"Пользователь {login} не найден в Active Directory.")
                return None

            user = self.connection.entries[0]

            account_control = user.userAccountControl.value if hasattr(user, 'userAccountControl') else 0
            is_active = (account_control & 2) == 0
            
            result = {
                "office_phone": user.telephoneNumber.value if hasattr(user, 'telephoneNumber') else None,
                "mobile_phone": user.mobile.value if hasattr(user, 'mobile') else None,
                "other_phones": user.otherTelephone.values if hasattr(user, 'otherTelephone') else [],
                "is_active": is_active
            }

            return result
        
        except Exception as e:
            raise LDAPException(f"Ошибка поиска пользователя в Active Directory: {e}")
from flask import current_app
import requests
import logging
import urllib3
from typing import Any


class BaseApiHandler:
    """
    Инстанс конструктора класса обработчика API.
    Инициализация инстанса осуществляется с помощью context manager [with().

    Args:
        base_url: URL-адрес, который будет использован для отправки запросов в контексте инстанса
        default_headers: Заголовки запроса по-умолчанию.
    """

    class WrongMethodException(requests.exceptions.HTTPError):
        pass

    class InvalidURLException(requests.exceptions.URLRequired):
        pass

    class FailedRequestException(requests.exceptions.RequestException):
        pass

    class ConnectionTimeoutException(requests.exceptions.ConnectTimeout):
        pass

    class RequestTimeoutException(requests.exceptions.ReadTimeout):
        pass

    def __init__(self, base_url: str = None, default_headers: dict[str, str] = None):
        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

        self.base_url = base_url
        self.headers = default_headers or {"Content-Type": "application/json"}
        self.session: requests.Session | None = None

    def __enter__(self):
        self.session = requests.Session()
        if self.headers:
            self.session.headers.update(self.headers)
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            self.session.close()
            self.session = None

    def send_request(self,
                     method: str,
                     url: str | None,
                     endpoint: str | None = None,
                     basic_auth: tuple[str, str] | None = None,
                     headers: dict[str, Any] | None = None,
                     params: dict[str, Any] | None = None,
                     data: dict[str, Any] | str | None = None,
                     json_data: dict[str, Any] | None = None,
                     timeout: int = 30,
                     verify: bool = False
        ) -> requests.Response | None:
        """
        Конструктор базового API запроса.

        Args:
            method: Метод запроса (GET, POST, UPDATE...)
            url: URL адрес запроса. Перезаписывает адрес, который инициализируется при вызове инстанса
            endpoint: Эндпоинт API запроса
            basic_auth: Базовая авторизация `(username, password)`
            headers: Список headers. Перезаписывает список, который инициализируется при вызове инстанса
            params: Параметры URL
            data: Данные для отправки (объект файла, справочник, байты)
            json_data: Объект JSON для отправки
            timeout: Таймаут запроса в секундах
            verify: Вкл/выкл проверку верификации подключения
        Returns:
            Объект `response` класса `request.Response`.
        """
        if method not in ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]:
            raise self.WrongMethodException(f"Некорректный метод запроса.")

        if url:
            base_url = url
        elif self.base_url:
            base_url = self.base_url
        else:
            raise self.InvalidURLException("URL-адрес запроса отсутствует.")

        if endpoint:
            base_url = f"{base_url.rstrip('/')}/{endpoint.lstrip('/')}"

        if not headers:
            headers = self.headers

        try:
            response = self.session.request(
                method=method,
                url=base_url,
                auth=basic_auth,
                headers=headers,
                params=params,
                data=data,
                json=json_data,
                timeout=timeout,
                verify=verify
            )

            if response.status_code >= 400:
                raise self.FailedRequestException(f"Неуспешный запрос:"
                                             f"{response.status_code} - {response.text if response.text else None}")

            return response

        except requests.ConnectTimeout:
            raise self.ConnectionTimeoutException(f"Превышено время ожидания подключения к серверу.")
        except requests.ReadTimeout:
            raise self.RequestTimeoutException(f"Превышено время ожидания ответа на запрос.")
        except (self.WrongMethodException, self.InvalidURLException, self.FailedRequestException):
            raise
        except Exception as e:
            raise Exception(f"Неизвестная ошибка: {e}")


class MSGraphApiHandler(BaseApiHandler):
    """Инстанс обработки API запросов в MS Graph"""

    def __init__(self):
        self.ms_api_config = {
            "login_url": current_app.config.get("MS_LOGIN_URL"),
            "graph_url": current_app.config.get("MS_GRAPH_URL"),
            "tenant_id": current_app.config.get("MS_GRAPH_API_TENANT_ID"),
            "client_id": current_app.config.get("MS_GRAPH_API_CLIENT_ID"),
            "client_secret": current_app.config.get("MS_GRAPH_API_CLIENT_SECRET"),
            "username": current_app.config.get("MS_GRAPH_API_USERNAME"),
            "password": current_app.config.get("MS_GRAPH_API_PASSWORD")
        }

        self.default_headers = {
            "Content-Type": "application/json",
            "Accept": "application/json"
        }

        self._authenticated = False

        super().__init__(self.ms_api_config.get("graph_url"), self.default_headers)

    def __enter__(self):
        super().__enter__()

        if not all(self.ms_api_config.values()):
            missing_keys = [key for key, value in self.ms_api_config.items() if not value]
            raise ValueError(f"Отсутствуют необходимые параметры конфигурации MS Graph: {missing_keys}")

        try:
            self.__authenticate()
        except Exception:
            if self.session:
                self.session.close()
                self.session = None
            raise

        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        return super().__exit__(exc_type, exc_val, exc_tb)

    def __is_authenticated(self):
        if not self._authenticated:
            self.__authenticate()

    def __authenticate(self) -> bool:
        """MS Graph auth method"""
        try:
            ms_auth_headers = {
                "Content-Type": "application/x-www-form-urlencoded"
            }

            access_token_endpoint = f"{self.ms_api_config.get("tenant_id")}/oauth2/v2.0/token"

            payload = {
                "grant_type": "password",
                "client_id": self.ms_api_config.get("client_id"),
                "client_secret": self.ms_api_config.get("client_secret"),
                "scope": f"{self.ms_api_config.get("graph_url")}/.default",
                "username": self.ms_api_config.get("username"),
                "password": self.ms_api_config.get("password")
            }

            response = self.send_request(method="POST",
                                         url=self.ms_api_config.get("login_url"),
                                         endpoint=access_token_endpoint,
                                         headers=ms_auth_headers,
                                         data=payload,
                                         timeout=60)

            token_data = response.json()
            self._access_token = token_data.get("access_token")

            if self.session:
                self.session.headers.update({
                    "Authorization": f"Bearer {self._access_token}",
                    "Content-Type": "application/json"
                })

            self._authenticated = True
            return True

        except Exception as e:
            logging.error(f"Ошибка авторизации MS Graph: {e}")
            self._authenticated = False
            raise


class OutlookApiHandler(MSGraphApiHandler):
    """"""

    def __init__(self):
        super().__init__()


class TeamsApiHandler(MSGraphApiHandler):
    """"""

    def __init__(self):
        super().__init__()
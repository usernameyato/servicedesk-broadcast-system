import time
from flask import Flask, request, g
from werkzeug.wrappers import Response
import logging

from .metrics import PrometheusMetrics


class MetricsMiddleware:
    """
    Класс оболочки экспортера Prometheus для автоматической генерации метрик.
    """

    def __init__(self, app: Flask | None = None, metrics: PrometheusMetrics | None = None) -> None:
        """
        Инициализация оболочки.

        Args:
            app: Экземпляр приложения Flask
            metrics: Коллекция метрик Prometheus
        """
        self.metrics = metrics

        if app is not None:
            self.init_app(app)

    def init_app(self, app: Flask) -> None:
        """
        Метод инициализации класса.

        Args:
            app: Экземпляр приложения Flask
        """
        if self.metrics is None:
            self.metrics = app.extensions.get('prometheus_metrics')

        if self.metrics is None:
            logging.warning("Экземпляр Prometheus не найден в расширениях приложения.")
            return

        app.before_request(self._before_request)
        app.after_request(self._after_request)

    def _before_request(self) -> None:
        """Обработка операции до HTTP-запроса."""
        g.start_time = time.time()
        g.request_module = _get_request_module()

        if self.metrics:
            self.metrics.increment_requests_in_progress(
                method=request.method,
                module=g.request_module
            )

    def _after_request(self, response: Response) -> Response:
        """
        Обработка операции после HTTP-запроса.

        Args:
            response: Ответ на HTTP-запрос приложения
        """
        if hasattr(g, 'start_time') and self.metrics:
            duration = time.time() - g.start_time
            endpoint = request.endpoint or 'unknown'
            module = getattr(g, 'request_module', 'unknown')

            self.metrics.record_http_request(
                method=request.method,
                endpoint=endpoint,
                status_code=response.status_code,
                duration=duration,
                module=module
            )

            self.metrics.decrement_requests_in_progress(
                method=request.method,
                module=module
            )

        return response


def _get_request_module() -> str:
    """Метод получения имени модуля, в котором операция была обработана."""
    endpoint = request.endpoint
    if endpoint:
        if '.' in endpoint:
            blueprint_name = endpoint.split('.')[0]
            return f'api.{blueprint_name}'

    path = request.path

    if path.startswith('/crq'):
        return 'crq'
    elif path.startswith('/inc'):
        return 'inc'
    elif path.startswith('/admin'):
        return 'admin'
    elif path.startswith('/auth'):
        return 'auth'
    elif path.startswith('/main'):
        return 'main'
    elif path.startswith('/static'):
        return 'static'
    elif path.startswith('/api/metrics'):
        return 'monitoring'
    else:
        return 'unknown'
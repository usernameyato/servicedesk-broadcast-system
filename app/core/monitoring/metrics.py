import os
from prometheus_client import Counter, Histogram, Gauge, generate_latest, CONTENT_TYPE_LATEST
from prometheus_client import multiprocess, CollectorRegistry
from flask import Flask, Response
import logging


class PrometheusMetrics:
    """
    Класс сборщика метрик Prometheus с поддержкой многопроцессности.
    """

    def __init__(self, app: Flask | None = None):
        """
        Инициализация сборщика метрик.

        Args:
            app: Экземпляр приложения Flask
        """
        _setup_multiprocess_dir()

        self._http_requests_total: Counter | None = None
        self._http_request_duration: Histogram | None = None
        self._http_requests_in_progress: Gauge | None = None
        self._business_operations_total: Counter | None = None
        self._active_users: Gauge | None = None
        self._crq_operations_total: Counter | None = None
        self._inc_operations_total: Counter | None = None

        if app is not None:
            self.init_app(app)

    def init_app(self, app: Flask):
        """
        Метод инициализации класса.

        Args:
            app: Экземпляр приложения Flask
        """
        self._initialize_metrics()
        _register_routes(app)
        app.extensions['prometheus_metrics'] = self

    def _initialize_metrics(self) -> None:
        """Вспомогательный метод объявления шаблона метрик."""
        self._http_requests_total = Counter(
            'flask_http_requests_total',
            'Total number of HTTP requests',
            ['method', 'endpoint', 'status_code', 'module']
        )

        self._http_request_duration = Histogram(
            'flask_http_request_duration_seconds',
            'HTTP request duration in seconds',
            ['method', 'endpoint', 'module'],
            buckets=(0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0)
        )

        # Для Gauge в multiprocess режиме используем process-specific метрики
        self._http_requests_in_progress = Gauge(
            'flask_http_requests_in_progress',
            'Number of HTTP requests currently being processed',
            ['method', 'module'],
            multiprocess_mode='livesum'
        )

        self._business_operations_total = Counter(
            'sbs_operations_total',
            'Total number of business operations',
            ['operation_type', 'status', 'module']
        )

        self._active_users = Gauge(
            'sbs_active_users',
            'Number of currently active users',
            multiprocess_mode='max'
        )

        self._crq_operations_total = Counter(
            'sbs_crq_operations_total',
            'Total number of CRQ operations',
            ['operation', 'status']
        )

        self._inc_operations_total = Counter(
            'sbs_inc_operations_total',
            'Total number of INC operations',
            ['operation', 'status']
        )

    def record_http_request(self, method: str, endpoint: str, status_code: int,
                            duration: float, module: str = 'unknown') -> None:
        """
        Метод записи метрик HTTP-запросов.

        Args:
            method: Метод HTTP-запроса (GET, POST, DELETE и т.д.)
            endpoint: Адрес HTTP-запроса
            status_code: Статус обработки HTTP-запроса
            duration: Длительность отработки HTTP-запроса
            module: Модуль, который принял и обработал запрос
        """
        if self._http_requests_total:
            self._http_requests_total.labels(
                method=method,
                endpoint=endpoint,
                status_code=str(status_code),
                module=module
            ).inc()

        if self._http_request_duration:
            self._http_request_duration.labels(
                method=method,
                endpoint=endpoint,
                module=module
            ).observe(duration)

    def increment_requests_in_progress(self, method: str, module: str = 'unknown') -> None:
        """
        Метод увеличения счетчика метрики запросов в статусе обработки.

        Args:
            method: Метод HTTP-запроса (GET, POST, DELETE и т.д.)
            module: Модуль, который принял и обработал запрос
        """
        if self._http_requests_in_progress:
            self._http_requests_in_progress.labels(method=method, module=module).inc()

    def decrement_requests_in_progress(self, method: str, module: str = 'unknown') -> None:
        """
        Метод уменьшения счетчика метрики запросов в статусе обработки.

        Args:
            method: Метод HTTP-запроса (GET, POST, DELETE и т.д.)
            module: Модуль, который принял и обработал запрос
        """
        if self._http_requests_in_progress:
            self._http_requests_in_progress.labels(method=method, module=module).dec()

    def record_business_operation(self, operation_type: str, status: str,
                                  module: str = 'unknown') -> None:
        """
        Метод сбора данных бизнес-функций для формирования метрики.

        Args:
            operation_type: Тип операции
            status: Статус обработки операции
            module: Модуль, в котором операция была отработана
        """
        if self._business_operations_total:
            self._business_operations_total.labels(
                operation_type=operation_type,
                status=status,
                module=module
            ).inc()

    def record_crq_operation(self, operation: str, status: str) -> None:
        """
        Метод сбора данных функций CRQ для формирования метрики.

        Args:
            operation: Тип операции
            status: Статус обработки операции
        """
        if self._crq_operations_total:
            self._crq_operations_total.labels(operation=operation, status=status).inc()

    def record_inc_operation(self, operation: str, status: str) -> None:
        """
        Метод сбора данных функций INC для формирования метрики.

        Args:
            operation: Тип операции
            status: Статус обработки операции
        """
        if self._inc_operations_total:
            self._inc_operations_total.labels(operation=operation, status=status).inc()

    def set_active_users(self, count: int) -> None:
        """
        Метод подсчета количества активных пользователей приложения.

        Args:
            count: Количество активных пользователей
        """
        if self._active_users:
            self._active_users.set(count)


def _setup_multiprocess_dir() -> None:
    """Настройка директории для multiprocess режима."""
    multiprocess_dir = os.environ.get('PROMETHEUS_MULTIPROC_DIR')
    if not multiprocess_dir:
        multiprocess_dir = '/tmp/prometheus_multiproc_dir'
        os.environ['PROMETHEUS_MULTIPROC_DIR'] = multiprocess_dir

    os.makedirs(multiprocess_dir, exist_ok=True)

    if os.path.exists(multiprocess_dir):
        for filename in os.listdir(multiprocess_dir):
            file_path = os.path.join(multiprocess_dir, filename)
            try:
                if os.path.isfile(file_path):
                    os.unlink(file_path)
            except Exception as e:
                logging.warning(f"Не удалось удалить файл метрик {file_path}: {e}")

def _register_routes(app: Flask) -> None:
    """
    Метод регистрации маршрутов для метрик.

    Args:
        app: Экземпляр приложения Flask
    """

    @app.route('/api/metrics')
    def metrics() -> Response:
        """Endpoint для получения агрегированных метрик всех процессов."""
        registry = CollectorRegistry()
        multiprocess.MultiProcessCollector(registry)
        data = generate_latest(registry)
        return Response(data, mimetype=CONTENT_TYPE_LATEST)

def cleanup_metrics() -> None:
    """
    Статический метод для очистки метрик воркера при его завершении.
    Должен вызываться в worker_exit хуке Gunicorn.
    """
    from prometheus_client import multiprocess
    multiprocess.mark_process_dead(os.getpid())
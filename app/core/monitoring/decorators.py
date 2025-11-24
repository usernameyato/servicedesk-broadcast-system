import functools
from typing import Callable, Any, TypeVar
from flask import current_app
import logging

F = TypeVar('F', bound=Callable[..., Any])


def track_operation(operation_type: str, module: str = 'unknown'):
    """
    Декоратор для обработки операций, не относящихся к CRQ или INC.

    Args:
        operation_type: Тип операции (search, create, delete, etc.)
        module: Модуль, в котором операция была отработана
    """

    def decorator(func: F) -> F:
        @functools.wraps(func)
        def wrapper(*args, **kwargs) -> Any:
            metrics = current_app.extensions.get('prometheus_metrics')
            status = 'success'

            try:
                result = func(*args, **kwargs)
                return result
            except Exception as e:
                status = 'error'
                logging.error(f"Operation {operation_type} failed: {e}")
                raise
            finally:
                if metrics:
                    metrics.record_business_operation(
                        operation_type=operation_type,
                        status=status,
                        module=module
                    )

        return wrapper

    return decorator


def track_crq_operation(operation: str):
    """
    Декоратор для обработки операций модуля CRQ.

    Args:
        operation: Тип операции (search, create, delete, etc.)
    """

    def decorator(func: F) -> F:
        @functools.wraps(func)
        def wrapper(*args, **kwargs) -> Any:
            metrics = current_app.extensions.get('prometheus_metrics')
            status = 'success'

            try:
                result = func(*args, **kwargs)
                return result
            except Exception as e:
                status = 'error'
                logging.error(f"CRQ operation {operation} failed: {e}")
                raise
            finally:
                if metrics:
                    metrics.record_crq_operation(operation=operation, status=status)

        return wrapper

    return decorator


def track_inc_operation(operation: str):
    """
    Декоратор для обработки операций модуля INC.

    Args:
        operation: Тип операции (search, create, delete, etc.)
    """

    def decorator(func: F) -> F:
        @functools.wraps(func)
        def wrapper(*args, **kwargs) -> Any:
            metrics = current_app.extensions.get('prometheus_metrics')
            status = 'success'

            try:
                result = func(*args, **kwargs)
                return result
            except Exception as e:
                status = 'error'
                logging.error(f"INC operation {operation} failed: {e}")
                raise
            finally:
                if metrics:
                    metrics.record_inc_operation(operation=operation, status=status)

        return wrapper

    return decorator
import eventlet
eventlet.monkey_patch()

import os
import shutil

bind = "0.0.0.0:5002"
worker_class = "eventlet"
workers = 1
timeout = 120
keepalive = 5

accesslog = "-"
errorlog = "-"
access_log_format = '%(h)s %(l)s %(u)s %(t)s "%(r)s" %(s)s %(b)s "%(f)s" "%(a)s"'
loglevel = "info"

limit_request_line = 4096
limit_request_fields = 100
limit_request_field_size = 8190

prometheus_multiproc_dir = '/tmp/prometheus_multiproc_dir'
os.environ['PROMETHEUS_MULTIPROC_DIR'] = prometheus_multiproc_dir


def on_starting(server):
    """
    Вызывается при запуске Gunicorn master процесса.
    Очищает директорию с метриками.
    """
    if os.path.exists(prometheus_multiproc_dir):
        shutil.rmtree(prometheus_multiproc_dir)
    os.makedirs(prometheus_multiproc_dir, exist_ok=True)
    server.log.info(f"Prometheus multiprocess directory prepared: {prometheus_multiproc_dir}")


def worker_exit(server, worker):
    """
    Вызывается при завершении worker процесса.
    Очищает метрики завершившегося процесса.
    """
    try:
        from prometheus_client import multiprocess
        multiprocess.mark_process_dead(worker.pid)
        server.log.info(f"Marked worker {worker.pid} as dead in Prometheus metrics")
    except ImportError:
        server.log.warning("prometheus_client not available for cleanup")
    except Exception as e:
        server.log.error(f"Error cleaning up metrics for worker {worker.pid}: {e}")


def on_exit(server):
    """
    Вызывается при завершении Gunicorn master процесса.
    Полная очистка директории метрик.
    """
    if os.path.exists(prometheus_multiproc_dir):
        shutil.rmtree(prometheus_multiproc_dir)
        server.log.info("Prometheus multiprocess directory cleaned up")
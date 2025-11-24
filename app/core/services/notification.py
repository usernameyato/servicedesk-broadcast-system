from flask import Flask
import threading
import queue
import uuid
from datetime import datetime, timedelta, time as t
from typing import Any
from enum import Enum
from dataclasses import dataclass, asdict
import logging


class TaskStatus(Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    PARTIAL = "partial"


@dataclass
class NotificationTask:
    """Датакласс для отслеживания задач нотификаций"""

    task_id: str
    inc_number: str
    notification_type: str
    total_recipients: int
    successful_sends: int = 0
    failed_sends: int = 0
    deferred_sends: int = 0
    status: TaskStatus = TaskStatus.PENDING
    created_at: datetime = None
    started_at: datetime = None
    completed_at: datetime = None
    error_message: str = None

    def __post_init__(self):
        if self.created_at is None:
            self.created_at = datetime.now()

    def to_dict(self) -> dict[str, Any]:
        """Конвертация объектов словаря задач"""
        result = asdict(self)
        result['status'] = self.status.value
        result['created_at'] = self.created_at.isoformat() if self.created_at else None
        result['started_at'] = self.started_at.isoformat() if self.started_at else None
        result['completed_at'] = self.completed_at.isoformat() if self.completed_at else None
        return result


class NotificationTaskManager:
    """Менеджер задач нотификаций - Flask Extension"""

    def __init__(self) -> None:
        self.tasks: dict[str, NotificationTask] = {}
        self.task_queue: queue.Queue = queue.Queue()
        self.worker_thread: threading.Thread | None = None
        self.running: bool = False
        self._tasks_lock: threading.Lock = threading.Lock()
        self._worker_lock: threading.Lock = threading.Lock()
        self._shutdown_event: threading.Event = threading.Event()
        self.app: Flask | None = None

    def init_app(self, app: Flask) -> None:
        """
        Инициализация расширения в контексте Flask app.

        Args:
            app: Экземпляр приложения Flask
        """
        self.app = app
        app.notification_manager = self

    def start_worker(self) -> None:
        """Запуск обработчика потока в фоновом режиме"""
        with self._worker_lock:
            if self.running and self.worker_thread and self.worker_thread.is_alive():
                logging.warning("Обработчик уже запущен и работает")
                return

            if self.app is None:
                raise RuntimeError("NotificationTaskManager инициализирован вне контекста Flask app")

            if self.worker_thread and self.worker_thread.is_alive():
                self.running = False
                self._shutdown_event.set()

                logging.info("Ожидание завершения предыдущего потока обработчика...")
                self.worker_thread.join(timeout=10)
                if self.worker_thread.is_alive():
                    logging.warning("Предыдущий поток обработчика не завершился в течение 10 секунд")

            self.running = True
            self._shutdown_event.clear()
            self.worker_thread = threading.Thread(
                target=self._worker_loop,
                daemon=True,
                name="NotificationWorker"
            )
            self.worker_thread.start()
            logging.info("Обработчик потока нотификации запущен")

    def stop_worker(self) -> None:
        """Завершение работы обработчика потока"""
        with self._worker_lock:
            if not self.running:
                logging.info("Worker уже остановлен.")
                return

            logging.info("Инициация остановки worker thread...")
            self.running = False
            self._shutdown_event.set()

            try:
                self.task_queue.put(None, timeout=1)
            except queue.Full:
                logging.warning("Не удалось добавить poison pill - очередь переполнена")

            if self.worker_thread and self.worker_thread.is_alive():
                self.worker_thread.join(timeout=10)

                if self.worker_thread.is_alive():
                    logging.warning("Worker thread не завершился за 10 секунд - возможно зависание")
                else:
                    logging.info("Worker thread успешно завершен")
            else:
                logging.info("Worker thread уже был завершен")

    def get_task_status(self, task_id: str) -> dict[str, Any] | None:
        """
        Получение статуса определенной задачи по ID

        Args:
            task_id: ID задачи в потоке

        Returns:
            Объект типа JSON с данными о текущей задаче
        """
        with self._tasks_lock:
            task = self.tasks.get(task_id)
            return task.to_dict() if task else None

    def get_all_tasks(self, limit: int | None = None, include_completed: bool = True) -> list[dict[str, Any]]:
        """
        Получение статуса всех задач (активных из памяти + завершенных из БД)

        Args:
            limit: Лимит количества задач из БД (по умолчанию без лимита)
            include_completed: Включать ли завершенные задачи из БД
        """
        with self._tasks_lock:
            active_tasks = [task.to_dict() for task in self.tasks.values()]

            if not include_completed:
                return active_tasks

            completed_tasks = self._get_completed_tasks_from_db(limit)

            all_tasks = active_tasks + completed_tasks

            all_tasks.sort(key=lambda x: x.get('created_at', ''), reverse=True)

            return all_tasks

    def submit_task(self, notification_type: str, users: list,
                    data: dict[str, Any],operator_ip: str, created_by: str) -> str | None:
        """
        Отправить новую задачу в поток

        Args:
            notification_type: Типа нотификации - 'sms' или 'email'
            users: Список получателей
            data: Данные для отправки нотификации
            operator_ip: IP адрес отправителя
            created_by: Логин отправителя

        Returns:
            ID отправленной в поток задачи
        """
        if not self.running or self._shutdown_event.is_set():
            logging.warning("Не удается принять задачу - worker не запущен или завершается")
            return None

        task_id = str(uuid.uuid4())

        task = NotificationTask(
            task_id=task_id,
            inc_number=data.get('inc_number', ''),
            notification_type=notification_type,
            total_recipients=len(users)
        )

        with self._tasks_lock:
            self.tasks[task_id] = task

        task_data = {
            'task_id': task_id,
            'notification_type': notification_type,
            'users': users,
            'data': data,
            'operator_ip': operator_ip,
            'created_by': created_by
        }

        if notification_type == 'sms':
            task_data['sms_text'] = data.get('sms_text', '')
        elif notification_type == 'email':
            task_data['email_subject'] = data.get('email_subject', '')

        try:
            self.task_queue.put(task_data, timeout=5)
            logging.info(f"Начата обработка задачи {task_id} на {notification_type} нотификацию.")
            return task_id
        except queue.Full:
            logging.error(f"Очередь переполнена - не удалось добавить задачу {task_id}")
            with self._tasks_lock:
                if task_id in self.tasks:
                    del self.tasks[task_id]
            return None

    def cleanup_old_tasks(self, max_age_hours: int = 24, stuck_task_hours: int = 2) -> None:
        """
        Очистка завершенных задач и зависших незавершенных задач

        Args:
            max_age_hours: Длительность хранения завершенных задач
            stuck_task_hours: Время, после которого PENDING/RUNNING задача считается зависшей
        """
        completed_cutoff = datetime.now() - timedelta(hours=max_age_hours)
        stuck_cutoff = datetime.now() - timedelta(hours=stuck_task_hours)

        with self._tasks_lock:
            tasks_to_remove = []

            for task_id, task in self.tasks.items():
                if (task.completed_at and task.completed_at < completed_cutoff
                        and task.status in [TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.PARTIAL]):
                    tasks_to_remove.append(task_id)

                elif (task.created_at and task.created_at < stuck_cutoff
                      and task.status in [TaskStatus.PENDING, TaskStatus.RUNNING]):
                    logging.warning(
                        f"Очистка зависшей задачи {task_id} в статусе {task.status.value}, длительность: {datetime.now() - task.created_at}")
                    tasks_to_remove.append(task_id)

            for task_id in tasks_to_remove:
                del self.tasks[task_id]

        if tasks_to_remove:
            logging.info(f"Очистка {len(tasks_to_remove)} задач завершена")

    def _get_completed_tasks_from_db(self, limit: int | None = None) -> list[dict[str, Any]]:
        """
        Получение завершенных задач из БД

        Args:
            limit: Лимит количества записей

        Returns:
            Объект типа list с данными о завершенных задачах
        """
        try:
            from app.core.models.inc_notification_tasks import IncidentsNotificationTasks

            active_task_ids = set(self.tasks.keys())

            query = IncidentsNotificationTasks.query.filter(
                ~IncidentsNotificationTasks.task_id.in_(active_task_ids)
            ).order_by(IncidentsNotificationTasks.created_at.desc())

            if limit:
                query = query.limit(limit)

            db_tasks = query.all()

            completed_tasks = []
            for db_task in db_tasks:
                task_dict = _db_task_to_dict(db_task)
                completed_tasks.append(task_dict)

            return completed_tasks

        except Exception as e:
            logging.error(f"Ошибка при получении задач из БД: {e}")
            return []

    def _worker_loop(self) -> None:
        """Объявление обработчика задач"""
        logging.info("Worker loop запущен")
        last_cleanup = datetime.now()

        while self.running and not self._shutdown_event.is_set():
            if datetime.now() - last_cleanup > timedelta(hours=1):
                self.cleanup_old_tasks()
                last_cleanup = datetime.now()

            task_id: str | None = None
            task_data: dict[str, Any] | None = None

            try:
                task_data = self.task_queue.get(timeout=1)

                if task_data is None:
                    logging.info("Получен сигнал завершения (poison pill)")
                    break

                task_id = task_data['task_id']

                if self._shutdown_event.is_set():
                    logging.info(f"Пропуск задачи {task_id} - получен сигнал завершения")
                    self._mark_task_failed(task_id, "Worker shutdown during processing", task_data)
                    break

                self._update_task_status(task_id, TaskStatus.RUNNING)

                with self.app.app_context():
                    self._process_notification_task(task_data)

            except queue.Empty:
                continue
            except KeyError as e:
                logging.error(f"Отсутствует обязательное поле в данных задачи: {e}")
                if task_data:
                    logging.debug(f"Данные задачи: {task_data}")
            except Exception as e:
                logging.error(f"Ошибка обработчика нотификаций: {e}", exc_info=True)
                if task_id is not None:
                    self._mark_task_failed(task_id, str(e), task_data)
            finally:
                try:
                    self.task_queue.task_done()
                except ValueError:
                    pass

        logging.info("Worker loop завершен")

    def _update_task_status(self, task_id: str, status: TaskStatus) -> None:
        """
        Обновление статуса задачи с блокировкой

        Args:
            task_id: ID задачи в потоке
            status: Новый статус задачи
        """
        with self._tasks_lock:
            if task_id in self.tasks:
                task = self.tasks[task_id]
                task.status = status
                if status == TaskStatus.RUNNING:
                    task.started_at = datetime.now()

    def _update_task_progress(self, task_id: str, successful: int = 0, failed: int = 0, deferred: int = 0) -> None:
        """
        Обновление прогресса задачи

        Args:
            task_id: ID задачи в потоке
            successful: Количество успешно отправленных СМС
            failed: Количество неуспешных попыток отправки СМС
            deferred: Количество отложенных получателей
        """
        with self._tasks_lock:
            if task_id in self.tasks:
                task = self.tasks[task_id]
                task.successful_sends = successful
                task.failed_sends = failed
                task.deferred_sends = deferred

    def _complete_task(self, task_id: str, task_data: dict[str, Any], status: TaskStatus,
                       successful: int = 0, failed: int = 0, deferred: int = 0) -> None:
        """
        Отметка задачи как успешно выполненной

        Args:
            task_id: ID задачи в потоке
            task_data: Внешние данные для записи в БД
            successful: Количество успешно отправленных СМС
            failed: Количество неуспешных попыток отправки СМС
            deferred: Количество отложенных получателей
            status: Новый статус задачи
        """
        with self._tasks_lock:
            if task_id in self.tasks:
                task = self.tasks[task_id]
                task.successful_sends = successful
                task.failed_sends = failed
                task.deferred_sends = deferred
                task.status = status
                task.completed_at = datetime.now()

                try:
                    _save_task_data_to_db(task, task_data)
                except Exception as e:
                    logging.error(f"Ошибка записи данных о статусе обработки задачи: {e}")
                finally:
                    if task_id in self.tasks:
                        del self.tasks[task_id]

        logging.info(f"Задача {task_id} выполнена со статусом {status.value}")

    def _mark_task_failed(self, task_id: str, error_message: str, task_data: dict[str, Any]) -> None:
        """
        Отметка задачи как неуспешной

        Args:
            task_id: ID задачи в потоке
            task_data: Внешние данные для записи в БД
        """
        with self._tasks_lock:
            if task_id in self.tasks:
                task = self.tasks[task_id]
                task.status = TaskStatus.FAILED
                task.error_message = error_message
                task.completed_at = datetime.now()

                try:
                    _save_task_data_to_db(task, task_data)
                except Exception as e:
                    logging.error(f"Ошибка записи данных о статусе обработки задачи: {e}")
                finally:
                    if task_id in self.tasks:
                        del self.tasks[task_id]

        logging.error(f"Задача {task_id} завершилась ошибкой: {error_message}")

    def _process_notification_task(self, task_data: dict[str, Any]) -> None:
        """
        Отработка единичной задачи нотификации

        Args:
            task_data: Внешние данные для обработки
        """
        task_id = task_data['task_id']
        notification_type = task_data['notification_type']

        try:
            if notification_type == 'sms':
                self._process_sms_task(task_data)
            elif notification_type == 'email':
                self._process_email_task(task_data)
            else:
                raise ValueError(f"Неизвестный тип нотификации: {notification_type}")

        except Exception as e:
            logging.error(f"Ошибка обработки задачи нотификации {task_id}: {e}")
            self._mark_task_failed(task_id, str(e), task_data)

    def _process_sms_task(self, task_data: dict[str, Any]) -> None:
        """
        Обработка задачи отправки СМС нотификации

        Args:
            task_data: Внешние данные для обработки
        """
        task_id = task_data['task_id']
        if self._shutdown_event.is_set():
            logging.info(f"Прерывание обработки задачи {task_id} - получен сигнал завершения")
            return

        from app.core.services.smpp import SMPPConnector
        from flask import current_app

        users = task_data['users']
        sms_text = task_data['sms_text']
        data = task_data['data']

        time_filtered = _apply_time_restrictions(users)
        receivers = time_filtered["receivers"]
        deferred_users = time_filtered["deferred"]

        successful_sends = 0
        failed_sends = 0

        try:
            if receivers:
                with SMPPConnector() as smpp:
                    for i, receiver in enumerate(receivers):
                        if self._shutdown_event.is_set():
                            logging.info(f"Прерывание отправки SMS для задачи {task_id}")
                            break

                        try:
                            logging.info(f"Отправка СМС на номер {receiver.ad_phone_number}...")
                            smpp.send_sms(receiver.ad_phone_number, sms_text)
                            successful_sends += 1

                            _log_sms_send_status(
                                data, receiver, status="Отправлена"
                            )

                            self._update_task_progress(
                                task_id, successful_sends, failed_sends, len(deferred_users)
                            )

                        except Exception as e:
                            logging.error(f"Ошибка отправки СМС на номер {receiver.ad_phone_number}: {e}")
                            failed_sends += 1

                            _log_sms_send_status(
                                data, receiver, status="Ошибка отправки"
                            )

                            self._update_task_progress(
                                task_id, successful_sends, failed_sends, len(deferred_users)
                            )

                        if i < len(receivers) - 1:
                            delay = current_app.config.get("SMPP_RECIPIENT_DELAY", 0.2)
                            if self._shutdown_event.wait(timeout=delay):
                                logging.info(f"Прерывание задержки для задачи {task_id}")
                                break

            for user in deferred_users:
                _log_sms_send_status(data, user, status="Отложена")

            final_status = TaskStatus.COMPLETED if failed_sends == 0 else TaskStatus.PARTIAL
            self._complete_task(task_id, task_data, final_status, successful_sends, failed_sends, len(deferred_users))

        except Exception as e:
            logging.error(f"Задача {task_id} потока отправки СМС завершилась ошибкой: {e}")
            self._mark_task_failed(task_id, str(e), task_data)

    def _process_email_task(self, task_data: dict[str, Any]) -> None:
        """
        Обработка задачи отправки почтовой рассылки.

        Args:
            task_data: Внешние данные для обработки
        """
        task_id = task_data['task_id']
        if self._shutdown_event.is_set():
            logging.info(f"Прерывание обработки задачи {task_id} - получен сигнал завершения")
            return

        from flask import render_template, current_app
        from flask_mail import Message
        from app import mail
        import os

        users = task_data['users']
        users_emails = [user.user_email for user in users]

        data = task_data['data']

        successful_sends = 0
        failed_sends = 0

        try:
            msg = Message(
                recipients=users_emails,
                subject=data.get("mail_subject"),
                cc=["servicedesk@beeline.kz", "rselyukov@beeline.kz", "ymakarychev@beeline.kz"]
            )

            msg.html = render_template(data.get("email_template_path"), **data)

            crq_number = data.get('content', {}).get('crq_number')
            if crq_number:
                try:
                    from app.core.models.crq_processed import CRQProcessed

                    crq = CRQProcessed.get_by_filter(crq_number=crq_number)
                    if crq and hasattr(crq, 'attachments') and crq.attachments:
                        upload_folder = current_app.config.get("UPLOAD_FOLDER")

                        for attachment in crq.attachments:
                            file_path = os.path.join(upload_folder, attachment.encoded_filename)
                            if os.path.exists(file_path):
                                try:
                                    with open(file_path, 'rb') as f:
                                        msg.attach(
                                            filename=attachment.original_filename,
                                            content_type='application/octet-stream',
                                            data=f.read()
                                        )
                                    logging.info(f"Прикреплен файл {attachment.original_filename} к email")
                                except Exception as e:
                                    logging.warning(f"Не удалось прикрепить файл {attachment.original_filename}: {e}")
                            else:
                                logging.warning(f"Файл не найден: {file_path}")

                except Exception as e:
                    logging.error(f"Ошибка при обработке вложений для CRQ {crq_number}: {e}")

            try:
                logging.info(f"Отправка EMAIL...")
                with mail.connect() as conn:
                    conn.send(msg)
                successful_sends += 1

                self._update_task_progress(task_id, successful_sends, failed_sends)
            except Exception as e:
                logging.error(f"Ошибка отправки EMAIL: {e}")
                failed_sends += 1

                self._update_task_progress(task_id, successful_sends, failed_sends)

            final_status = TaskStatus.COMPLETED if failed_sends == 0 else TaskStatus.FAILED
            self._complete_task(task_id, task_data, final_status, successful_sends, failed_sends)

        except Exception as e:
            logging.error(f"Задача {task_id} потока отправки EMAIL завершилась ошибкой: {e}")
            self._mark_task_failed(task_id, str(e), task_data)

def _db_task_to_dict(db_task: Any) -> dict[str, Any]:
    """
    Конвертация модели БД в словарь в том же формате, что и NotificationTask.to_dict().

    Args:
        db_task: Набор данных с информацией о задаче

    Returns:
        Конвертированные в виде словаря данные
    """
    return {
        'task_id': db_task.task_id,
        'inc_number': db_task.inc_number,
        'notification_type': db_task.notification_type,
        'total_recipients': db_task.total_recipients,
        'successful_sends': db_task.successful_sends,
        'failed_sends': db_task.failed_sends,
        'deferred_sends': db_task.deferred_sends,
        'status': db_task.status,
        'created_at': db_task.created_at.isoformat() if db_task.created_at else None,
        'started_at': db_task.started_at.isoformat() if db_task.started_at else None,
        'completed_at': db_task.completed_at.isoformat() if db_task.completed_at else None,
        'error_message': db_task.error_message
    }


def _save_task_data_to_db(task: NotificationTask, task_data: dict[str, Any]) -> None:
    """
    Запись данных обработки задачи в таблицу для истории.

    Args:
         task: Объект задачи класса NotificationTask
         task_data: Внешние данные для записи в БД
    """
    try:
        from app.core.models.inc_notification_tasks import IncidentsNotificationTasks

        processing_duration_seconds = None
        if task.started_at and task.completed_at:
            processing_duration_seconds = int((task.completed_at - task.started_at).total_seconds())

        operator_ip = task_data.get("operator_ip", "")
        created_by = task_data.get("created_by", "")
        sms_text = task_data.get("sms_text", "")

        IncidentsNotificationTasks.create(
            task_id=task.task_id,
            inc_number=task.inc_number,
            notification_type=task.notification_type,
            total_recipients=task.total_recipients,
            successful_sends=task.successful_sends,
            failed_sends=task.failed_sends,
            deferred_sends=task.deferred_sends,
            status=task.status.value,
            created_at=task.created_at,
            started_at=task.started_at,
            completed_at=task.completed_at,
            processing_duration_seconds=processing_duration_seconds,
            created_by=created_by,
            operator_ip=operator_ip,
            error_message=task.error_message,
            message=sms_text
        )

        logging.info(f"Статус обработки задачи {task.task_id} записан в БД.")
    except Exception as e:
        raise Exception(f"Ошибка записи данных задачи: {e}")

def _apply_time_restrictions(users: list) -> dict[str, Any]:
    """
    Применение временных ограничений для уведомлений.

    Args:
        users: Список пользователей для отправки

    Returns:
        Словарь с разделенными получателями и отложенными уведомлениями
    """
    day_start = t(8, 0)
    day_end = t(22, 0)
    current_time = datetime.now().time()
    is_daytime = day_start <= current_time <= day_end

    if is_daytime:
        return {
            "receivers": users,
            "deferred": []
        }
    else:
        receivers = [user for user in users if user.night_notifications_enabled == "1"]
        deferred = [user for user in users if user.night_notifications_enabled == "0"]
        return {
            "receivers": receivers,
            "deferred": deferred
        }

def _log_sms_send_status(data: dict[str, Any], user: Any, status: str = "Неизвестно") -> None:
    """
    Логирование отложенных сообщений.

    Args:
        data: Данные для записи.
        user: Список получателей нотификации.
        status: Статус нотификации. 'Отложено' или 'Отправлено'
    """
    try:
        from app.core.models.sms_logs import SMSLog

        SMSLog.create(
            inc_id=data.get("inc_number"),
            sms_text=data.get("sms_text"),
            ad_phone_number=user.ad_phone_number,
            sms_status=status,
            send_date=datetime.now()
        )

        logging.info(f"Статус отправки оповещения для {user.user_login} записан в БД.")
    except Exception as e:
        raise Exception(f"Ошибка записи данных получателей СМС: {e}")

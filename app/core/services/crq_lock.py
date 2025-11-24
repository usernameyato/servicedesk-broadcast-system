import json
import logging
import os
import threading
import time
from datetime import datetime, timedelta
from dataclasses import dataclass
from enum import Enum

import redis


class LockStatus(Enum):
    LOCKED = "locked"
    AVAILABLE = "available"
    EXPIRED = "expired"


@dataclass
class LockInfo:
    """Информация о заблокированном элементе CRQ."""

    crq_number: str
    user_id: str
    user_name: str
    locked_at: datetime
    expires_at: datetime
    session_id: str

    def is_expired(self) -> bool:
        return datetime.now() > self.expires_at

    def to_dict(self) -> dict:
        return {
            'crq_number': self.crq_number,
            'user_id': self.user_id,
            'user_name': self.user_name,
            'locked_at': self.locked_at.isoformat(),
            'expires_at': self.expires_at.isoformat(),
            'session_id': self.session_id
        }

    @classmethod
    def from_dict(cls, data: dict) -> 'LockInfo':
        """Создает объект LockInfo из словаря."""
        return cls(
            crq_number=data['crq_number'],
            user_id=data['user_id'],
            user_name=data['user_name'],
            locked_at=datetime.fromisoformat(data['locked_at']),
            expires_at=datetime.fromisoformat(data['expires_at']),
            session_id=data['session_id']
        )


class CRQLockManager:
    """Класс менеджера блокировок CRQ с поддержкой Redis для многопроцессного окружения."""

    def __init__(self, redis_url: str = None, default_lock_duration: int = 300):
        """
        Инициализация менеджера блокировок.

        Args:
            redis_url: URL для подключения к Redis
            default_lock_duration: Время блокировки по умолчанию в секундах
        """
        self.default_lock_duration = default_lock_duration
        self.redis_url = redis_url or os.getenv("REDIS_URL", "redis://:S3cure_Redis_Pass@172.28.83.219:6379/0")

        self.lock_prefix = "crq_lock:"
        self.user_session_prefix = "crq_user_sessions:"
        self.cleanup_lock_key = "crq_cleanup_lock"

        self._init_redis_client()

        self._start_cleanup_thread()

    def _init_redis_client(self):
        """Инициализация клиента Redis с обработкой ошибок."""
        try:
            self.redis_client = redis.from_url(
                self.redis_url,
                decode_responses=True,
                socket_connect_timeout=5,
                socket_timeout=5,
                retry_on_timeout=True,
                health_check_interval=30
            )
            self.redis_client.ping()
            logging.info("Successfully connected to Redis")
        except Exception as e:
            logging.error(f"Failed to connect to Redis: {e}")
            raise

    def _start_cleanup_thread(self):
        """Запуск фонового потока для очистки просроченных блокировок."""
        self._cleanup_thread = threading.Thread(
            target=self._cleanup_expired_locks,
            daemon=True,
            name="CRQLockCleanup"
        )
        self._cleanup_thread.start()

    def acquire_lock(self, crq_number: str, user_id: str, user_name: str,
                     session_id: str, duration: int | None) -> tuple[bool, LockInfo | None]:
        """
        Метод получения блокировки элемента.

        Args:
            crq_number: Номер CRQ
            user_id: ID пользователя
            user_name: Логин пользователя
            session_id: ID сессии пользователя
            duration: Длительность блокировки в секундах

        Returns:
            Статус блокировки, а так же объект существующего Lock, если блокировка уже существует
        """
        lock_key = self._get_lock_key(crq_number)
        lock_duration = duration or self.default_lock_duration
        expires_at = datetime.now() + timedelta(seconds=lock_duration)

        try:
            existing_lock_data = self.redis_client.get(lock_key)

            if existing_lock_data:
                try:
                    existing_lock = LockInfo.from_dict(json.loads(existing_lock_data))

                    if existing_lock.is_expired():
                        self._remove_lock_redis(crq_number, existing_lock)
                    else:
                        if existing_lock.user_id == user_id:
                            self._extend_lock_redis(crq_number, lock_duration)
                            return True, None
                        else:
                            return False, existing_lock
                except (json.JSONDecodeError, KeyError) as e:
                    logging.error(f"Error parsing existing lock data for {crq_number}: {e}")
                    self.redis_client.delete(lock_key)

            lock_info = LockInfo(
                crq_number=crq_number,
                user_id=user_id,
                user_name=user_name,
                locked_at=datetime.now(),
                expires_at=expires_at,
                session_id=session_id
            )

            pipe = self.redis_client.pipeline()
            pipe.set(lock_key, json.dumps(lock_info.to_dict()), ex=lock_duration)
            pipe.sadd(self._get_user_sessions_key(user_id), session_id)
            pipe.execute()

            logging.info(f"Lock acquired for CRQ {crq_number} by user {user_name}")
            return True, None

        except redis.RedisError as e:
            logging.error(f"Redis error while acquiring lock for {crq_number}: {e}")
            raise
        except Exception as e:
            logging.error(f"Unexpected error while acquiring lock for {crq_number}: {e}")
            raise

    def release_lock(self, crq_number: str, user_id: str, session_id: str) -> bool:
        """
        Метод снятия блокировки с элемента CRQ.

        Args:
            crq_number: Номер CRQ
            user_id: ID пользователя
            session_id: ID сессии пользователя

        Returns:
            Статус снятия блокировки
        """
        try:
            lock_key = self._get_lock_key(crq_number)
            existing_lock_data = self.redis_client.get(lock_key)

            if not existing_lock_data:
                logging.warning(f"Attempted to release non-existent lock for CRQ {crq_number}")
                return False

            try:
                existing_lock = LockInfo.from_dict(json.loads(existing_lock_data))

                if (existing_lock.user_id == user_id and
                        existing_lock.session_id == session_id):

                    self._remove_lock_redis(crq_number, existing_lock)
                    logging.info(f"Lock released for CRQ {crq_number} by user {existing_lock.user_name}")
                    return True
                else:
                    logging.warning(
                        f"Unauthorized lock release attempt for CRQ {crq_number} "
                        f"by user {user_id}, session {session_id}"
                    )
                    return False

            except (json.JSONDecodeError, KeyError) as e:
                logging.error(f"Error parsing lock data for release {crq_number}: {e}")
                self.redis_client.delete(lock_key)
                return True

        except redis.RedisError as e:
            logging.error(f"Redis error while releasing lock for {crq_number}: {e}")
            raise
        except Exception as e:
            logging.error(f"Unexpected error while releasing lock for {crq_number}: {e}")
            raise

    def extend_lock(self, crq_number: str, user_id: str, session_id: str,
                    duration: int | None) -> bool:
        """
        Метод продления существующей блокировки элемента CRQ.

        Args:
            crq_number: Номер CRQ
            user_id: ID пользователя
            session_id: ID сессии пользователя
            duration: Длительность продления в секундах

        Returns:
            Статус продления блокировки
        """
        try:
            lock_key = self._get_lock_key(crq_number)
            existing_lock_data = self.redis_client.get(lock_key)

            if not existing_lock_data:
                return False

            try:
                existing_lock = LockInfo.from_dict(json.loads(existing_lock_data))

                if (existing_lock.user_id == user_id and
                        existing_lock.session_id == session_id):

                    lock_duration = duration or self.default_lock_duration
                    self._extend_lock_redis(crq_number, lock_duration)
                    logging.debug(f"Lock extended for CRQ {crq_number}")
                    return True
                else:
                    return False

            except (json.JSONDecodeError, KeyError) as e:
                logging.error(f"Error parsing lock data for extend {crq_number}: {e}")
                return False

        except redis.RedisError as e:
            logging.error(f"Redis error while extending lock for {crq_number}: {e}")
            raise
        except Exception as e:
            logging.error(f"Unexpected error while extending lock for {crq_number}: {e}")
            raise

    def get_lock_status(self, crq_number: str) -> tuple[LockStatus, LockInfo | None]:
        """
        Метод получения информации о текущем статусе блокировки элемента.

        Args:
            crq_number: Номер CRQ

        Returns:
            Статус и информация о блокировке
        """
        try:
            lock_key = self._get_lock_key(crq_number)
            existing_lock_data = self.redis_client.get(lock_key)

            if not existing_lock_data:
                return LockStatus.AVAILABLE, None

            try:
                existing_lock = LockInfo.from_dict(json.loads(existing_lock_data))

                if existing_lock.is_expired():
                    self._remove_lock_redis(crq_number, existing_lock)
                    return LockStatus.EXPIRED, None

                return LockStatus.LOCKED, existing_lock

            except (json.JSONDecodeError, KeyError) as e:
                logging.error(f"Error parsing lock data for status {crq_number}: {e}")
                self.redis_client.delete(lock_key)
                return LockStatus.AVAILABLE, None

        except redis.RedisError as e:
            logging.error(f"Redis error while getting lock status for {crq_number}: {e}")
            raise
        except Exception as e:
            logging.error(f"Unexpected error while getting lock status for {crq_number}: {e}")
            raise

    def get_all_locks(self) -> dict[str, LockInfo]:
        """
        Метод получения всех текущих блокировок.

        Returns:
            Словарь с информацией о текущих блокировках
        """
        try:
            locks = {}
            lock_keys = self.redis_client.keys(f"{self.lock_prefix}*")

            for lock_key in lock_keys:
                try:
                    lock_data = self.redis_client.get(lock_key)
                    if lock_data:
                        lock_info = LockInfo.from_dict(json.loads(lock_data))
                        crq_number = lock_key.replace(self.lock_prefix, "")

                        if not lock_info.is_expired():
                            locks[crq_number] = lock_info
                        else:
                            self._remove_lock_redis(crq_number, lock_info)

                except (json.JSONDecodeError, KeyError) as e:
                    logging.error(f"Error parsing lock data for key {lock_key}: {e}")
                    self.redis_client.delete(lock_key)

            return locks

        except redis.RedisError as e:
            logging.error(f"Redis error while getting all locks: {e}")
            raise
        except Exception as e:
            logging.error(f"Unexpected error while getting all locks: {e}")
            raise

    def _get_lock_key(self, crq_number: str) -> str:
        """Получить Redis ключ для блокировки CRQ."""
        return f"{self.lock_prefix}{crq_number}"

    def _get_user_sessions_key(self, user_id: str) -> str:
        """Получить Redis ключ для сессий пользователя."""
        return f"{self.user_session_prefix}{user_id}"

    def _extend_lock_redis(self, crq_number: str, duration: int):
        """
        Внутренний метод продления блокировки в Redis.

        Args:
            crq_number: Номер CRQ
            duration: Длительность в секундах
        """
        lock_key = self._get_lock_key(crq_number)
        existing_lock_data = self.redis_client.get(lock_key)

        if existing_lock_data:
            try:
                lock_info = LockInfo.from_dict(json.loads(existing_lock_data))
                lock_info.expires_at = datetime.now() + timedelta(seconds=duration)

                self.redis_client.set(lock_key, json.dumps(lock_info.to_dict()), ex=duration)

            except (json.JSONDecodeError, KeyError) as e:
                logging.error(f"Error extending lock for {crq_number}: {e}")

    def _remove_lock_redis(self, crq_number: str, lock_info: LockInfo):
        """
        Внутренний метод снятия блокировки в Redis.

        Args:
            crq_number: Номер CRQ
            lock_info: Информация о блокировке
        """
        try:
            pipe = self.redis_client.pipeline()
            pipe.delete(self._get_lock_key(crq_number))

            user_sessions_key = self._get_user_sessions_key(lock_info.user_id)
            pipe.srem(user_sessions_key, lock_info.session_id)

            pipe.scard(user_sessions_key)
            results = pipe.execute()

            if results[-1] == 0:
                self.redis_client.delete(user_sessions_key)

        except redis.RedisError as e:
            logging.error(f"Redis error while removing lock for {crq_number}: {e}")

    def _cleanup_expired_locks(self):
        """Внутренний метод очистки блокировок с истекшим временем жизни."""
        while True:
            try:
                with self.redis_client.lock(
                        self.cleanup_lock_key,
                        timeout=60,
                        blocking_timeout=5
                ):
                    expired_count = 0
                    lock_keys = self.redis_client.keys(f"{self.lock_prefix}*")

                    for lock_key in lock_keys:
                        try:
                            lock_data = self.redis_client.get(lock_key)
                            if lock_data:
                                lock_info = LockInfo.from_dict(json.loads(lock_data))
                                if lock_info.is_expired():
                                    crq_number = lock_key.replace(self.lock_prefix, "")
                                    self._remove_lock_redis(crq_number, lock_info)
                                    expired_count += 1

                        except (json.JSONDecodeError, KeyError) as e:
                            logging.error(f"Error during cleanup of {lock_key}: {e}")
                            self.redis_client.delete(lock_key)

                    if expired_count > 0:
                        logging.info(f"Cleaned up {expired_count} expired locks")

                time.sleep(30)

            except redis.exceptions.LockError:
                time.sleep(60)
            except Exception as e:
                logging.error(f"Ошибка очистки просроченных блокировок: {e}")
                time.sleep(60)

lock_manager = CRQLockManager()
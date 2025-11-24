from flask import current_app
import logging
import re
from datetime import datetime
from pytz import timezone
from typing import Any

from app.core.models.users import Users
from app.core.services.ldap import LDAPConnector


def parse_text(text: str, patterns: dict[str, Any]) -> dict[str, Any] | None:
    """
    Метод парсинга текста по указанному списку паттернов.

    Args:
        text: Текст, который необходимо распарсить.
        patterns: Словарь паттернов regular expression, которые необходимо применить к тексту. E.g. {"pattern1": r".*"}

    Returns:
        Словарь первых попаданий, полученных при парсинге
    """
    try:
        result = {}

        for key, pattern in patterns.items():
            match = re.search(pattern, text, re.DOTALL)
            result[key] = match.group(1).strip() if match else None

        return result

    except Exception as e:
        logging.error(f"Ошибка парсинга текста детального описания: {e}")
        return None

def safe_format_datetime(dt: datetime | None, tz: str = "Asia/Almaty", fmt: str = "%Y-%m-%d %H:%M") -> str | None:
    """
    Метод форматирования даты времени для элемента input type="datetime-local" формы.

    Args:
        dt: Значение даты-времени
        tz: Временная зона
        fmt: Формат даты времени

    Returns:
        Измененное по указанному формату значение даты-времени, или None в если входящее значение отсутствует
    """
    if dt is None:
        return None
    return dt.astimezone(timezone(tz)).strftime(fmt)

def format_datetime(dt: str | None, dt_format: str = "%Y-%m-%dT%H:%M") -> datetime | None:
    """
    Форматирования даты времени для парсинга в строке сообщения.

    Args:
        dt: Значение даты-времени
        dt_format: Формат даты времени

    Returns:
        Измененное по указанному формату значение даты-времени, или None в если входящее значение отсутствует
    """
    if not dt:
        return None
    return datetime.strptime(dt, dt_format)

def format_display_date(dt_str: str | None) -> str | None:
    """
    Метод формирования строки '01.01.1970 в 00:00'.

    Args:
        dt_str: Значение даты-времени

    Returns:
        Измененное по формату значение даты-времени, или None в если входящее значение отсутствует
    """
    if not dt_str:
        return None
    dt_obj = format_datetime(dt_str)
    return f"{dt_obj.day:02d}.{dt_obj.month:02d}.{dt_obj.strftime('%y')} в {dt_obj.hour:02d}:{dt_obj.minute:02d}"

def format_duration_display(start: str | None, end: str | None) -> str | None:
    """
    Метод формирования строки 'C 01.01.1970 00:00 по 02.01.1970 00:00'.

    Args:
        start: Значение даты-времени начала влияния
        end: Значение даты-времени завершения влияния

    Returns:
        Измененное по формату значение даты-времени, или None в если входящее значение отсутствует
    """
    if not start or not end:
        return None
    start_dt = format_datetime(start)
    end_dt = format_datetime(end)
    return f"C {start_dt.day:02d}.{start_dt.month:02d}.{start_dt.strftime('%y')} {start_dt.hour:02d}:{start_dt.minute:02d} по {end_dt.day:02d}.{end_dt.month:02d}.{end_dt.strftime('%y')} {end_dt.hour:02d}:{end_dt.minute:02d}"

def calculate_downtime(start: str | None, end: str | None) -> dict[str, int]:
    """
    Метод калькуляции времени простоя.

    Args:
        start: Значение даты-времени начала влияния
        end: Значение даты-времени завершения влияния

    Returns:
        Длительность простоя в виде словаря, или 0, если значения длительности простоя отсутствует или ровно нулю
    """
    if not start or not end:
        return {"days": 0, "hours": 0, "minutes": 0, "total_minutes": 0}
    start_dt = format_datetime(start)
    end_dt = format_datetime(end)

    total_seconds = int((end_dt - start_dt).total_seconds())

    days = total_seconds // (24 * 3600)
    remaining_seconds = total_seconds % (24 * 3600)
    hours = remaining_seconds // 3600
    remaining_seconds %= 3600
    minutes = remaining_seconds // 60

    return {
        "days": days,
        "hours": hours,
        "minutes": minutes,
        "total_minutes": total_seconds // 60
    }

def format_downtime_display(start: str | None, end: str | None) -> str:
    """
    Форматирование длительности простоя в вид строки.

    Args:
        start: Значение даты-времени начала влияния
        end: Значение даты-времени завершения влияния

    Returns:
        Длительность простоя в виде строки, или 0, если значения длительности простоя отсутствует или ровно нулю
    """
    downtime = calculate_downtime(start, end)

    if downtime["days"] == 0 and downtime["hours"] == 0 and downtime["minutes"] == 0:
        return "0 мин."

    parts = []
    if downtime["days"] > 0:
        parts.append(f"{downtime['days']} д.")

    if downtime["hours"] > 0:
        parts.append(f"{downtime['hours']} ч.")

    if downtime["minutes"] > 0:
        parts.append(f"{downtime['minutes']} мин.")

    return " ".join(parts)

def format_phone_to_standard(phone_number: str | None) -> str | None:
    """
    Форматирование номер телефона под стандарт KZ: '7777777777'

    Args:
        phone_number: Номер телефона для форматирования

    Returns:
        Скорректированный номер телефона типа str, или None в случае получения некорректного номера
    """
    if phone_number is None:
        return None

    digits_only = ''.join(c for c in str(phone_number) if c.isdigit())

    if len(digits_only) < 10:
        return None

    if digits_only and digits_only[0] == "8":
        digits_only = "7" + digits_only[1:]

    if len(digits_only) >= 11:
        return digits_only[:11]
    elif len(digits_only) == 10:
        return '7' + digits_only

    return None

def process_users_update() -> dict[str, Any]:
    """Метод очистки таблицы пользователей от неактивных УЗ."""
    try:
        users_data = Users.query.all()
        deleted_user_count = 0

        admin_username = current_app.config.get("AD_ADMIN_USERNAME")
        admin_password = current_app.config.get("AD_ADMIN_PASSWORD")

        with LDAPConnector(admin_username, admin_password) as ldap:
            for user in users_data:
                if (user_ad_info := ldap.get_user_info(user.user_login)) is not None:
                    user_status = 'Active' if user_ad_info['is_active'] else 'Disabled'
                else:
                    user_status = 'Not Found'

                if user_status != 'Active':
                    user.delete()
                    deleted_user_count += 1

            if deleted_user_count == 0:
                return {"status": "success", "message": "Актуализация не требуется: все статусы пользователей актуальны."}

        return {"status": "success", "deleted_users": deleted_user_count}

    except Exception as e:
        logging.error(f"Ошибка процесса актуализации списка пользователей SBS: {e}")
        return {"status": "error", "message": str(e)}

# ----
# TODO: Продумать способ обработки отложенных сообщений
# ----
# def send_deferred_messages() -> dict[str, str]:
#     """Метод отправки отложенных СМС."""
#     from app.core.models.sms_logs import SMSLog
#     from app.extensions import notification_manager
#     try:
#
#         return {"status": "success", "message": "Задача на отправку отложенных сообщений запущена."}
#
#     except Exception as e:
#         logging.error(f"Ошибка отправки отложенных сообщений: {e}")
#         return {"status": "error", "message": str(e)}
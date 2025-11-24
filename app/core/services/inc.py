import logging
import json
from typing import Any

from app.core.monitoring.decorators import track_operation
from app.core.models.inc_raw import Incidents
from app.core.models.subscriptions import Subscriptions
from app.core.models.users import Users
from app.core.utils import helpers
from app.extensions import notification_manager


class IncidentService:
    """Инстанс обработки операций над инцидентами."""

    @track_operation("inc-query-all", "inc")
    @staticmethod
    def get_incident_by_id(inc_id: str) -> Incidents:
        """
        Метод получения инстанса инцидента по номеру.

        Args:
            inc_id: Номер инцидента

        Returns:
            Инцидент в виде инстанса модели Incidents
        """
        return Incidents.get_by_filter(inc_id=inc_id)

    @track_operation("inc-search", "inc")
    @staticmethod
    def get_inc_data(ind_id: str, parse_description: bool = None) -> dict[str, Any]:
        """
        Метод получения данных из инцидента в виде списка с/без парсингом поля детального описания.

        Args:
            ind_id: Номер инцидента
            parse_description: Необходимо ли парсить детальное описание на 'Влияние' и 'Причину'

        Returns:
            Объект типа словарь с данными об инциденте
        """
        try:
            if not ind_id:
                logging.error("Необходимо указать номер инцидента.")
                return {
                    "status": "rejected",
                    "message": "Необходимо указать номер инцидента."
                }

            inc = IncidentService.get_incident_by_id(ind_id)

            if not inc:
                return {
                    "status": "not_found",
                    "message": "Инцидент не найден в базе данных"
                }

            inc_details = {
                "incNumber": inc.inc_id,
                "incPriority": inc.priority,
                "incStatus": inc.status,
                "incImpactShortDetails": inc.short_description,
                "incImpactDetails": inc.detailed_description,
                "incRequestCreated": helpers.safe_format_datetime(inc.creation_date),
                "incSolutionTime": helpers.safe_format_datetime(inc.solution_date),
                "incImpactStartDate": helpers.safe_format_datetime(inc.accident_start_date),
                "incEndDate": helpers.safe_format_datetime(inc.accident_end_date),
                "incCI": inc.ci,
                "incService": inc.service
            }

            if parse_description:
                patterns = {
                    "influence": r"^(.*?)\sДлительность:",
                    "reason": r"Причина:\s(.*?)\sЧто сделано:",
                }

                parsed_dtls = helpers.parse_text(inc.detailed_description, patterns)
                influence = parsed_dtls.get("influence") if parsed_dtls.get("influence") else inc.detailed_description
                reason = parsed_dtls.get("reason") if parsed_dtls.get("reason") else "Выясняется"

                return {
                    "inc_details": inc_details,
                    "influence": influence,
                    "reason": reason
                }
            else:
                return {
                    "inc_details": inc_details,
                    "influence": inc.detailed_description,
                    "reason": "Не указана"
                }
        except Exception as e:
            logging.error(f"Ошибка поиска инцидента: {e}")
            return {"error": "Ошибка поиска инцидента."}

    @staticmethod
    def prepare_notification(data: dict[str, Any]) -> dict[str, Any]:
        """
        Метод генерации СМС и темы письма.

        Args:
            data: JSON-like объект с данными для генерации нотификации

        Returns:
            Объект типа словарь с обработанными данными
        """
        try:
            required_fields = ["inc_number", "inc_state"]
            for field in required_fields:
                if not data.get(field):
                    return {
                        "status": "rejected",
                        "message": f"Поле '{field}' обязательно для заполнения."
                    }

            inc = Incidents.get_by_id(data.get("inc_number"))
            if not inc:
                return {
                    "status": "not_found",
                    "message": "Инцидент не найден в базе данных"
                }

            template = IncidentService._generate_template(data, inc)
            if not template or "не обработан" in template.get("message"):
                return {
                    "status": "template_error",
                    "message": "Ошибка генерации сообщения"
                }

            return {
                "status": "success",
                "message": template.get("message"),
                "email_subject": template.get("email_subject")
            }
        except Exception as e:
            logging.error(f"Ошибка подготовки данных для генерации темплейта: {e}")
            return {
                "status": "unknown",
                "message": f"Ошибка подготовки данных для генерации темплейта."
            }

    @track_operation("notification-process", "inc")
    @staticmethod
    def process_notification_async(notification_type: str, data: dict,
                                   operator_ip: str, created_by: str) -> dict[str, Any]:
        """
        Асинхронная отправка нотификаций.

        Args:
            notification_type: Тип нотификации: 'sms' или 'email'
            data: JSON-like объект, содержащий данные для нотификации
            operator_ip: IP адрес, с которого был отправлен запрос
            created_by: Логин отправителя

        Returns:
            ID задачи и текущий статус обработки
        """
        try:
            validation_result = IncidentService._validate_notification_data(data)
            if validation_result.get("status") != "success":
                return validation_result

            selected_subs = data.get("subscriptions", [])
            inc_priority = data.get("inc_priority", "")
            users = IncidentService._get_receivers_list(selected_subs, inc_priority)

            if not users:
                return {
                    "status": "not_found",
                    "message": "Список получателей пуст."
                }

            if not notification_manager.running:
                notification_manager.start_worker()

            if notification_type == "email":
                data.update({
                    "inc_creation_time": helpers.format_display_date(data.get("inc_creation_time")),
                    "inc_impact_start_time": helpers.format_display_date(data.get("inc_impact_start_time")),
                    "inc_impact_end_time": helpers.format_display_date(data.get("inc_impact_end_time")),
                    "downtime": f"{helpers.format_duration_display(data.get('inc_impact_start_time'), data.get('inc_impact_end_time'))} "
                                f"({helpers.format_downtime_display(data.get('inc_impact_start_time'), data.get('inc_impact_end_time'))})",
                    "inc_resolution_time": helpers.format_display_date(data.get("inc_resolution_time")),
                    "inc_resumed_time": helpers.format_display_date(data.get("inc_resumed_time")),
                    "inc_priority_increase_time": helpers.format_display_date(data.get("inc_priority_increase_time")),
                    "email_template_path": "email/email_template_inc.html"
                })

            task_id = notification_manager.submit_task(notification_type, users, data, operator_ip, created_by)

            return {
                "status": "accepted",
                "message": f"Задача отправки {notification_type} принята в обработку",
                "task_id": task_id,
                "total_recipients": len(users)
            }

        except Exception as e:
            logging.error(f"Ошибка постановки задачи в очередь: {e}")
            return {
                "status": "error",
                "message": f"Ошибка постановки задачи в очередь: {e}"
            }

    @track_operation("notification-status-search", "inc")
    @staticmethod
    def get_notification_status(task_id: str) -> dict[str, Any]:
        """
        Получение статуса нотификации по ID задачи.

        Args:
            task_id: ID задачи

        Returns:
            Объект task типа словарь с данными о задаче
        """
        try:
            task_status = notification_manager.get_task_status(task_id)

            if not task_status:
                return {
                    "status": "not_found",
                    "message": "Задача не найдена"
                }

            return {
                "status": "success",
                "task": task_status
            }

        except Exception as e:
            logging.error(f"Error getting task status: {e}")
            return {
                "status": "error",
                "message": f"Ошибка получения статуса задачи: {e}"
            }

    @staticmethod
    def _generate_template(data: dict, inc: Incidents) -> dict[str, Any]:
        """
        Генерация СМС и темы письма для рассылки.

        Args:
            data: JSON-like объект с данными для генерации нотификации
            inc: Номер инцидента

        Returns:
            Лист с готовым СМС и темой письма
        """
        try:
            status_templates = {
                "Зарегистрирован": lambda: (
                    f"{helpers.format_display_date(data.get('inc_creation_time'))} "
                    f"ЗАРЕГИСТРИРОВАН инцидент {data.get('inc_number')}, приоритет {data.get('inc_priority')}. "
                    f"ВЛИЯНИЕ: {data.get('inc_impact')}",
                    f"{data.get('inc_number')}_ЗАРЕГИСТРИРОВАН_{inc.short_description}"
                ),
                "Устранено влияние": lambda: (
                    f"{helpers.format_display_date(data.get('inc_impact_end_time'))} "
                    f"УСТРАНЕНО ВЛИЯНИЕ инцидента {data.get('inc_number')}, приоритет {data.get('inc_priority')}. "
                    f"ДЛИТЕЛЬНОСТЬ ПРОСТОЯ: {helpers.format_duration_display(data.get('inc_impact_start_time'), data.get('inc_impact_end_time'))} "
                    f"({helpers.format_downtime_display(data.get('inc_impact_start_time'), data.get('inc_impact_end_time'))}). "
                    f"ВЛИЯНИЕ: {data.get('inc_impact')}. ПРИЧИНА: {data.get('inc_reason')}",
                    f"{data.get('inc_number')}_УСТРАНЕНО ВЛИЯНИЕ_{inc.short_description}"
                ),
                "Зарегистрирован/устранено влияние": lambda: (
                    f"{helpers.format_display_date(data.get('inc_impact_end_time'))} "
                    f"ЗАРЕГИСТРИРОВАН/УСТРАНЕНО ВЛИЯНИЕ инцидента {data.get('inc_number')}, приоритет {data.get('inc_priority')}. "
                    f"ДЛИТЕЛЬНОСТЬ ПРОСТОЯ: {helpers.format_duration_display(data.get('inc_impact_start_time'), data.get('inc_impact_end_time'))} "
                    f"({helpers.format_downtime_display(data.get('inc_impact_start_time'), data.get('inc_impact_end_time'))}). "
                    f"ВЛИЯНИЕ: {data.get('inc_impact')}. ПРИЧИНА: {data.get('inc_reason')}",
                    f"{data.get('inc_number')}_ЗАРЕГИСТРИРОВАН/УСТРАНЕНО ВЛИЯНИЕ_{inc.short_description}"
                ),
                "Решен": lambda: (
                    f"{helpers.format_display_date(data.get('inc_resolution_time'))} "
                    f"РЕШЕН инцидент {data.get('inc_number')}, приоритет {data.get('inc_priority')}. "
                    f"ДЛИТЕЛЬНОСТЬ ПРОСТОЯ: {helpers.format_duration_display(data.get('inc_impact_start_time'), data.get('inc_impact_end_time'))} "
                    f"({helpers.format_downtime_display(data.get('inc_impact_start_time'), data.get('inc_impact_end_time'))}). "
                    f"ВЛИЯНИЕ: {data.get('inc_impact')}. ПРИЧИНА: {data.get('inc_reason')}",
                    f"{data.get('inc_number')}_РЕШЕН_{inc.short_description}"
                ),
                "Дополнение": (
                    f"ДОПОЛНЕНИЕ к инциденту {data.get('inc_number')}, приоритет {data.get('inc_priority')}. "
                    f"ВЛИЯНИЕ: {data.get('inc_impact')}. ПРИЧИНА: {data.get('inc_reason')}",
                    f"{data.get('inc_number')}_ДОПОЛНЕНИЕ_{inc.short_description}"
                ),
            }

            if data.get("inc_state") in ["Возобновлено/устранено влияние", "Возобновлено влияние"]:
                message = (
                    f"{helpers.format_display_date(data.get('inc_resumed_time'))} "
                    f"{'ВОЗОБНОВЛЕНО' if 'Возобновлено влияние' in data.get('inc_state') else 'ВОЗОБНОВЛЕНО/УСТРАНЕНО'}"
                    f"ВЛИЯНИЕ инцидента {data.get('inc_number')}, приоритет {data.get('inc_priority')}. "
                    f"ВЛИЯНИЕ: {data.get('inc_impact')}. ПРИЧИНА: {data.get('inc_reason')}"
                )
                email_subject = f"{data.get('inc_number')}_{'ВОЗОБНОВЛЕНО' if 'Возобновлено влияние' in data.get('inc_state') else 'ВОЗОБНОВЛЕНО/УСТРАНЕНО'} ВЛИЯНИЕ_{inc.short_description}"

            elif data.get("inc_state") in ["Дополнение/повышен приоритет", "Дополнение/понижен приоритет",
                                           "Зарегистрирован/повышен приоритет"]:
                message = (
                    f"{'ДОПОЛНЕНИЕ к инциденту' if 'Дополнение' in data.get('inc_state') else 'ЗАРЕГИСТРИРОВАН инцидент'} {data.get('inc_number')}, приоритет {data.get('inc_priority_after')}. "
                    f"{helpers.format_display_date(data.get('inc_priority_increase_time'))} "
                    f"приоритет {'повышен' if 'повышен' in data.get('inc_state') else 'понижен'} до {data.get('inc_priority')}. "
                    f"ВЛИЯНИЕ: {data.get('inc_impact')}. ПРИЧИНА: {data.get('inc_reason')}"
                )
                email_subject = f"{data.get('inc_number')}_{'ДОПОЛНЕНИЕ' if 'Дополнение' in data.get('inc_state') else 'ЗАРЕГИСТРИРОВАН'}/ПРИОРИТЕТ {'ПОВЫШЕН' if 'повышен' in data.get('inc_state') else 'ПОНИЖЕН'}_{inc.short_description}"

            elif data.get("inc_state") in status_templates:
                template = status_templates[data.get("inc_state")]
                message, email_subject = template() if callable(template) else template

            else:
                message = "Статус не обработан. Уточните статус для генерации сообщения."
                email_subject = ""

            return {"message": message, "email_subject": email_subject}

        except Exception as e:
            raise Exception(f"Ошибка генерации темплейта для нотификации по инциденту: {e}")

    @staticmethod
    def _validate_notification_data(data: dict) -> dict[str, Any]:
        """
        Валидация данных для отправки нотификации.

        Args:
            data: Данные для валидации

        Returns:
            Результат валидации
        """
        if not data:
            return {
                "status": "rejected",
                "message": "Данные для обработки нотификации отсутствуют."
            }

        required_fields = ["subscriptions"]
        for field in required_fields:
            if not data.get(field):
                return {
                    "status": "rejected",
                    "message": f"Поле '{field}' обязательно для заполнения."
                }

        return {"status": "success"}

    @staticmethod
    def _get_receivers_list(selected_subs: list, inc_priority: str = None) -> list:
        """
        Метод сбора данных получателей рассылки по указанным тематикам.

        Args:
            selected_subs: Лист тематик подписок
            inc_priority: (optional) приоритет инцидента

        Returns:
            Лист получателей рассылки, или пустой лист в случае ошибки
        """
        try:
            selected_subs_data = Subscriptions.query.filter(
                Subscriptions.sub_name.in_(selected_subs)
            ).all()

            if not selected_subs_data:
                logging.warning(f"Отсутствующие подписки: {selected_subs}")
                return []

            selected_subs_ids = [str(sub.sub_id) for sub in selected_subs_data]

            from sqlalchemy import text

            conditions = []
            params = {'inc_priority': inc_priority}

            for i, sub_id in enumerate(selected_subs_ids):
                param_name = f'sub_id_{i}'
                params[param_name] = sub_id
                conditions.append(f"""
                            EXISTS (
                                SELECT 1 FROM jsonb_array_elements(subscriptions -> 'incidents_subs') elem 
                                WHERE elem ->> 'sub_id' = :{param_name}
                                AND elem -> 'sub_details' -> 'priorities' @> :inc_priority_json
                            )
                        """)

            params['inc_priority_json'] = json.dumps([inc_priority])

            query_condition = " OR ".join(conditions)
            users = Users.query.filter(text(query_condition)).params(**params).all()

            return [user for user in users]

        except Exception as e:
            raise Exception(f"Ошибка получения списка получателей: {e}")
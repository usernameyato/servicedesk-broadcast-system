import logging
from flask_login import current_user
from typing import Any

from app.core.monitoring.decorators import track_operation
from app.core.models.subscriptions import Subscriptions


class SubscriptionsService:
    """Класс обработки операций над подписками."""

    @staticmethod
    def get_all_subscriptions() -> list[Subscriptions]:
        """Метод получение списка доступных подписок."""
        return Subscriptions.get_all()

    @staticmethod
    def get_subs_list() -> list | dict[str, Any]:
        """Метод конвертации инстанса подписок в словарь."""
        try:
            subs = SubscriptionsService.get_all_subscriptions()

            if not subs:
                return {"status": "not_found", "message": "Список подписок пуст."}

            subs_data = [
                {
                    "id": sub.sub_id,
                    "name": sub.sub_name,
                    "description": sub.sub_description
                } for sub in subs
            ]

            return subs_data
        except Exception as e:
            logging.error(f"Ошибка получения списка подписок: {e}")
            return {"status": "error", "message": "Ошибка получения списка подписок"}


    @staticmethod
    def load_user_subscriptions() -> dict[str, Any]:
        """Метод загрузки настроек подписок пользователя."""
        try:
            subscriptions = Subscriptions.get_all()

            subscription_data = current_user.subscriptions
            off_hours = current_user.night_notifications_enabled

            subscription_list = []

            maintenance_subs = set(subscription_data.get("maintenance_subs", []))
            incidents_dict = {}
            for incident in subscription_data.get("incidents_subs", []):
                incidents_dict[incident["sub_id"]] = incident["sub_details"]["priorities"]

            for sub in subscriptions:
                sub_id_str = str(sub.sub_id)

                subscription_list.append({
                    "id": sub.sub_id,
                    "name": sub.sub_name,
                    "description": sub.sub_description or "",
                    "incidents_checked": sub_id_str in incidents_dict,
                    "maintenance_checked": sub_id_str in maintenance_subs,
                    "priorities": [int(p) for p in incidents_dict.get(sub_id_str, [])]
                })

            return {
                "subscriptions": subscription_list,
                "off_hours": off_hours
            }
        except Exception as e:
            logging.error(f"Ошибка загрузки списка подписок пользователя: {e}")
            return {"error": str(e)}

    @track_operation("subscriptions-update", "subscriptions")
    @staticmethod
    def process_subscription_settings(data: dict[str, Any]) -> dict[str, Any]:
        """
        Метод обработки данных подписок пользователя.

        Args:
            data: Словарь с данными настроек для обработки

        Returns:
            Статус обработки процесса
        """
        try:
            maintenance_subs = []
            incidents_subs = []

            subscriptions_data = data.get("subscriptions", [])

            for sub_data in subscriptions_data:
                sub_id = str(sub_data.get("id"))
                incidents_checked = sub_data.get("incidents_checked", False)
                maintenance_checked = sub_data.get("maintenance_checked", False)
                priorities = [str(p) for p in sub_data.get("priorities", [])]

                if maintenance_checked:
                    maintenance_subs.append(sub_id)

                if incidents_checked:
                    incidents_subs.append({
                        "sub_id": sub_id,
                        "sub_details": {
                            "priorities": priorities
                        }
                    })

            subscription_settings = {
                "maintenance_subs": maintenance_subs,
                "incidents_subs": incidents_subs
            }

            off_hours = data.get("off_hours", "0")

            current_user.update(
                subscription_settings=subscription_settings,
                night_notifications_enabled=off_hours
            )

            return {"message": "Подписки обновлены успешно."}
        except Exception as e:
            logging.error(f"Ошибка обновления подписок пользователя: {e}")
            return {"error": str(e)}
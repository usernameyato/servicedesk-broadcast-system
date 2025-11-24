from flask_login import current_user
from typing import Any
import logging

from app.core.monitoring.decorators import track_operation
from app.core.models.feedbacks import Feedbacks


class FeedbacksService:
    """Класс обработки операций над обратной связью пользователей."""

    @track_operation("feedbacks-query", "feedback")
    @staticmethod
    def get_all_feedbacks(order_by: str, order_direction: str) -> list[Feedbacks]:
        """
        Получение списка всех отзывов с сортировкой на убывание.

        Args:
            order_by: Поле, по которому необходимо сгруппировать данные
            order_direction: Направление сортировки (desc, asc)

        Returns:
            Список отзывов, представленных в виде инстаносов модели Feedbacks
        """
        return Feedbacks.get_all_ordered(order_by=order_by, order_direction=order_direction)

    @track_operation("feedbacks-query-user", "feedback")
    @staticmethod
    def get_users_feedbacks(order_by: str, order_direction: str, **fields: dict[str: Any]) -> list[Feedbacks]:
        """
        Получение списка отзывов пользователя с сортировкой на убывание.

        Args:
            order_by: Поле, по которому необходимо сгруппировать данные
            order_direction: Направление сортировки (desc, asc)
            fields: Дополнительный фильтр по полю username (username=current_user.user_name)

        Returns:
            Список отзывов пользователя, представленных в виде инстаносов модели Feedbacks
        """
        return Feedbacks.get_all_by_filter_ordered(order_by=order_by, order_direction=order_direction, **fields)

    @staticmethod
    def get_formatted_feedbacks(feedbacks: list[Feedbacks]) -> list:
        """
        Форматирование списка отзывов для рендера на странице.

        Args:
            feedbacks: Список подписок для сортировки

        Returns:
            Отформатированный список подписок
        """
        try:
            formatted_feedbacks = [
                {
                    "id": feedback.feedback_id,
                    "username": feedback.username,
                    "message": feedback.message,
                    "timestamp": feedback.timestamp.strftime("%Y-%m-%d %H:%M:%S"),
                    "response": feedback.response
                } for feedback in feedbacks
            ]

            return formatted_feedbacks
        except Exception as e:
            logging.error(f"Ошибка загрузки отзывов пользователя: {e}")
            return []

    @track_operation("feedbacks-create", "feedback")
    @staticmethod
    def post_feedback(data: dict[str, Any]) -> dict[str, Any]:
        """
        Метод записи отзыва пользователя в БД.

        Args:
            data: Словарь с данными из API запроса

        Returns:
            Ответ обработки запроса (успешно/неуспешно)
        """
        try:
            Feedbacks.create(
                username=current_user.user_login,
                email=current_user.user_email,
                message=data.get("message")
            )

            return {'success': True, 'message': 'Feedback submitted successfully'}
        except Exception as e:
            logging.error(f"Ошибка отправки отзыва: {e}.")
            return {'error': str(e)}

    @track_operation("feedbacks-reply", "feedback")
    @staticmethod
    def reply_on_feedback(data: dict[str, Any]) -> dict[str, Any]:
        """
        Метод создания ответа на отзыв пользователя.

        Args:
            data: Словарь с данными из API запроса

        Returns:
            Ответ обработки запроса (успешно/неуспешно)
        """
        try:
            if not data.get("feedback_id") or not data.get("response"):
                return {"error": "Необходимо указать ID отзыва и текст ответа"}

            feedback_id = int(data.get("feedback_id"))
            feedback = Feedbacks.get_by_id(feedback_id)
            if not feedback:
                return {"error": "Отзыв не найден."}

            feedback.update(response=data.get("response"))

            return {"success": "Ответ успешно сохранен"}
        except Exception as e:
            logging.error(f"Ошибка сохранения ответа на отзыв: {e}")
            return {"error": str(e)}
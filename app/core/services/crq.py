import logging
import os
import uuid
from datetime import datetime
from typing import Any
from sqlalchemy import func
from flask import current_app
from werkzeug.datastructures import ImmutableMultiDict, FileStorage

from app.core.monitoring.decorators import track_operation
from app.core.models.crq_attachments import CRQAttachments
from app.core.models.crq_processed import CRQProcessed
from app.core.models.crq_raw import CRQSource
from app.core.models.subscriptions import Subscriptions
from app.core.models.users import Users
from app.core.models.partners_emails import PartnersEmails
from app.core.models.partners_groups import PartnerGroups
from app.extensions import db, notification_manager
from app.core.utils import helpers


class CrqService:
    """Класс сервиса обработки операций над плановыми работами."""

    @track_operation("calendar-query", "crq")
    @staticmethod
    def get_calendar_data(service: str = "td", from_date: str = None, to_date: str = None) -> dict[str, Any]:
        """
        Метод получения списка CRQ по указанным фильтрам.

        Args:
            service: Сервис, к которому относятся данные работы - ТД/ДИТ
            from_date: Начальная дата периода
            to_date: Конечная дата периода

        Returns:
            Лист плановых работ
        """
        try:
            service_value = 'ТД' if service.lower() == 'td' else 'ДИТ'

            crq_list = CRQProcessed.query.filter(
                func.date(CRQProcessed.start_date).between(
                    datetime.strptime(from_date, '%Y-%m-%d'), datetime.strptime(to_date, '%Y-%m-%d')
                ),CRQProcessed.direction == service_value
            ).all()

            grouped_crq_list = {}
            all_dates_set = set()

            for crq in crq_list:
                crq_date = crq.start_date.date().isoformat()
                all_dates_set.add(crq_date)

                if crq_date not in grouped_crq_list:
                    grouped_crq_list[crq_date] = []

                attachment_info = []
                for attachment in crq.attachments:
                    attachment_info.append({
                        'id': attachment.id,
                        'name': attachment.original_filename
                    })

                crq_data = {
                    'crq_number': crq.crq_number,
                    'status': crq.status,
                    'work_type': crq.crq_type,
                    'service': crq.direction,
                    'impact': crq.impact_status,
                    'short_description': crq.short_description,
                    'detailed_description': crq.detailed_description,
                    'cause': crq.cause,
                    'impact_details': crq.impact_details,
                    'comments': crq.comments,
                    'start_date': crq.start_date.strftime('%Y-%m-%d %H:%M'),
                    'end_date': crq.end_date.strftime('%Y-%m-%d %H:%M'),
                    'sub_name': crq.sub_type,
                    'initiator': crq.initiator,
                    'attachment': attachment_info
                }

                grouped_crq_list[crq_date].append(crq_data)

            sorted_dates_list = sorted(list(all_dates_set))

            return {
                'status': 'success',
                'dates': sorted_dates_list,
                'grouped_crq_list': grouped_crq_list
            }

        except Exception as e:
            logging.error(f"Ошибка получения списка CRQ: {e}")
            return {
                'status': 'error',
                'message': str(e)
            }

    @track_operation("crq-search", "crq")
    @staticmethod
    def get_crq_data(crq_number: str, source: str) -> dict[str, Any]:
        """
        Метод получения данных о CRQ.

        Args:
            crq_number: Номер CRQ
            source: Тип источника данных

        Returns:
            Словарь с данными CRQ или информацией об ошибке
        """
        try:
            model_mapping = {
                "processed": CRQProcessed,
                "raw": CRQSource,
            }

            model_class = model_mapping.get(source)
            if not model_class:
                return {
                    "status": "not_found",
                    "message": f"Неизвестный источник данных: {source}. Доступные: {list(model_mapping.keys())}"
                }

            crq = model_class.get_by_filter(crq_number=crq_number)
            if not crq:
                return {
                    "status": "not_found",
                    "message": f"CRQ не найден."
                }

            crq_data = (crq.to_dict(include_attachments=True)
                        if crq.has_attachments_support()
                        else crq.to_dict())

            return {
                "status": "success",
                "data": crq_data
            }
        except Exception as e:
            logging.error(f"Ошибка поиска CRQ: {e}")
            return {
                "status": "error",
                "message": str(e)
            }

    @track_operation("crq-create", "crq")
    @staticmethod
    def add_crq_with_files(incoming_crq_data: dict[str, Any],
                           files: ImmutableMultiDict[str, FileStorage] = None) -> dict[str, Any]:
        """
        Метод создания нового CRQ с файлами в одной транзакции.

        Args:
            incoming_crq_data: Набор данных для создания CRQ
            files: Список файлов для загрузки (опционально)

        Returns:
            Статус обработки операции
        """
        if not incoming_crq_data:
            return {
                "status": "not_found",
                "message": "Отсутствуют данные для сохранения CRQ."
            }

        existing_crq = CRQProcessed.get_by_filter(crq_number=incoming_crq_data.get("crq_number"))
        if existing_crq:
            return {
                "status": "conflict",
                "message": "CRQ с таким ID уже существует в базе данных."
            }

        uploaded_files = []

        try:
            crq_data = {
                "crq_number": incoming_crq_data.get("crq_number"),
                "direction": incoming_crq_data.get("crq_direction"),
                "impact_status": incoming_crq_data.get("crq_impact"),
                "impact_details": incoming_crq_data.get("crq_impact_details"),
                "start_date": incoming_crq_data.get("crq_start_date"),
                "end_date": incoming_crq_data.get("crq_end_date"),
                "short_description": incoming_crq_data.get("crq_short_description"),
                "detailed_description": incoming_crq_data.get("crq_detailed_description"),
                "initiator": incoming_crq_data.get("crq_initiator_name"),
                "status": incoming_crq_data.get("crq_status"),
                "sub_type": incoming_crq_data.get("sub_names"),
                "cause": incoming_crq_data.get("crq_cause"),
                "sent_date": datetime.now(),
                "comments": incoming_crq_data.get("crq_comment", ""),
                "crq_type": incoming_crq_data.get("crq_work_type")
            }

            crq = CRQProcessed.create(**crq_data)
            db.session.flush()

            if files:
                uploaded_files = CrqService._process_files_without_commit(crq.id, files)

            file_ids = incoming_crq_data.get("file_ids", [])
            if file_ids:
                CrqService._link_existing_files_without_commit(crq.id, file_ids)

            db.session.commit()

            return {
                "status": "success",
                "message": "CRQ создан",
                "data": {
                    "crq": crq.to_dict(),
                    "uploaded_files": uploaded_files
                }
            }

        except Exception as e:
            logging.error(f"Ошибка создания CRQ: {e}")
            db.session.rollback()
            return {
                "status": "error",
                "message": str(e)
            }

    @track_operation("crq-update", "crq")
    @staticmethod
    def update_crq(crq_number: str, incoming_crq_data: dict[str, Any],
                   files: ImmutableMultiDict[str, FileStorage] = None) -> dict[str, Any]:
        """
        Метод обновления CRQ с файлами в одной транзакции.

        Args:
            crq_number: Номер CRQ для обновления
            incoming_crq_data: Набор данных для обновления CRQ
            files: Список файлов для загрузки (опционально)

        Returns:
            Статус обработки операции
        """
        try:
            if not incoming_crq_data:
                return {
                    "status": "not_found",
                    "message": "Отсутствуют данные для обновления CRQ."
                }

            # Найти существующий CRQ
            existing_crq = CRQProcessed.get_by_filter(crq_number=crq_number)
            if not existing_crq:
                return {
                    "status": "not_found",
                    "message": "CRQ не найден для обновления."
                }

            uploaded_files = []

            # Обновить основные данные CRQ
            crq_update_data = {
                "direction": incoming_crq_data.get("crq_direction"),
                "impact_status": incoming_crq_data.get("crq_impact"),
                "impact_details": incoming_crq_data.get("crq_impact_details"),
                "start_date": incoming_crq_data.get("crq_start_date"),
                "end_date": incoming_crq_data.get("crq_end_date"),
                "short_description": incoming_crq_data.get("crq_short_description"),
                "detailed_description": incoming_crq_data.get("crq_detailed_description"),
                "initiator": incoming_crq_data.get("crq_initiator_name"),
                "status": incoming_crq_data.get("crq_status"),
                "sub_type": incoming_crq_data.get("sub_names"),
                "cause": incoming_crq_data.get("crq_cause"),
                "comments": incoming_crq_data.get("crq_comment", ""),
                "crq_type": incoming_crq_data.get("crq_work_type")
            }

            # Обновить поля CRQ
            for field, value in crq_update_data.items():
                if value is not None:  # Обновляем только непустые значения
                    setattr(existing_crq, field, value)

            db.session.flush()

            # Обработка файлов
            new_file_ids = incoming_crq_data.get("new_file_ids", [])
            kept_file_ids = incoming_crq_data.get("kept_file_ids", [])

            # Получить все текущие файлы CRQ
            current_attachments = CRQAttachments.query.filter_by(crq_number=existing_crq.id).all()
            current_file_ids = {attachment.id for attachment in current_attachments}

            # Определить файлы для удаления (те, что есть сейчас, но не в kept_file_ids)
            files_to_delete_ids = current_file_ids - set(kept_file_ids)

            # Удалить файлы, которые не должны остаться
            if files_to_delete_ids:
                CrqService._delete_files_without_commit(files_to_delete_ids)

            # Привязать новые временные файлы к CRQ
            if new_file_ids:
                CrqService._link_existing_files_without_commit(existing_crq.id, new_file_ids)

            # Обработать загруженные файлы (если есть)
            if files:
                uploaded_files = CrqService._process_files_without_commit(existing_crq.id, files)

            db.session.commit()

            return {
                "status": "success",
                "message": "CRQ обновлен",
                "data": {
                    "crq": existing_crq.to_dict(),
                    "uploaded_files": uploaded_files
                }
            }

        except Exception as e:
            logging.error(f"Ошибка обновления CRQ: {e}")
            db.session.rollback()
            return {
                "status": "error",
                "message": str(e)
            }

    @track_operation("files-upload", "crq")
    @staticmethod
    def upload_files(crq_number: str, files: ImmutableMultiDict[str, FileStorage]) -> dict[str, Any]:
        """
        Старый метод загрузки файлов для обратной совместимости.

        Args:
            crq_number: Номер CRQ
            files: Словарь с объектами файлов

        Returns:
            Статус обработки операции
        """
        try:
            crq = CRQProcessed.get_by_filter(crq_number=crq_number)
            if not crq:
                return {
                    "status": "not_found",
                    "message": "CRQ не найден."
                }

            uploaded_files = CrqService._process_files_without_commit(crq.id, files)
            db.session.commit()

            return {
                "status": "success",
                "data": uploaded_files
            }

        except Exception as e:
            logging.error(f"Ошибка загрузки файлов: {e}")
            db.session.rollback()
            return {
                "status": "error",
                "message": str(e)
            }

    @track_operation("files-upload-temp", "crq")
    @staticmethod
    def upload_temporary_files(files: ImmutableMultiDict[str, FileStorage]) -> dict[str, Any]:
        """
        Метод временной загрузки файлов (без привязки к CRQ).

        Args:
            files: Список файлов из формы

        Returns:
            Список временно загруженных файлов с их ID
        """
        try:
            if not files:
                return {
                    "status": "not_found",
                    "message": "Отсутствуют файлы для загрузки."
                }

            upload_folder = current_app.config["UPLOAD_FOLDER"]
            uploaded_files = []

            for file in files.getlist('files'):
                original_filename = file.filename
                _, extension = os.path.splitext(original_filename)
                encoded_filename = f"{uuid.uuid4()}{extension}"
                file_path = os.path.join(upload_folder, encoded_filename)
                file.save(file_path)

                saved_file = CRQAttachments.create(
                    crq_number=None,
                    original_filename=original_filename,
                    encoded_filename=encoded_filename,
                    upload_date=datetime.now()
                )
                uploaded_files.append(saved_file.to_dict())

            db.session.commit()

            return {
                "status": "success",
                "data": uploaded_files
            }

        except Exception as e:
            logging.error(f"Ошибка временной загрузки файлов: {e}")
            db.session.rollback()
            return {
                "status": "error",
                "message": str(e)
            }

    @track_operation("file-delete", "crq")
    @staticmethod
    def delete_file(file_id: int) -> dict[str, Any]:
        """
        Метод удаления файла.

        Args:
            file_id: ID файла для удаления

        Returns:
            Статус операции
        """
        try:
            file_obj = CRQAttachments.get_by_id(file_id)
            if not file_obj:
                return {
                    "status": "not_found",
                    "message": "Файл не найден."
                }

            upload_folder = current_app.config["UPLOAD_FOLDER"]
            file_path = os.path.join(upload_folder, file_obj.encoded_filename)
            if os.path.exists(file_path):
                os.remove(file_path)

            CRQAttachments.delete(file_obj)
            db.session.commit()

            return {
                "status": "success",
                "message": "Файл удален"
            }

        except Exception as e:
            logging.error(f"Ошибка удаления файла: {e}")
            db.session.rollback()
            return {
                "status": "error",
                "message": str(e)
            }

    @track_operation("files-delete-temp", "crq")
    @staticmethod
    def cleanup_temporary_files() -> None:
        """Метод очистки временных файлов (файлы без привязки к CRQ старше определенного времени)"""
        try:
            from datetime import timedelta

            cutoff_time = datetime.now() - timedelta(hours=24)

            temp_files = CRQAttachments.query.filter(
                CRQAttachments.crq_number.is_(None),
                CRQAttachments.upload_date < cutoff_time
            ).all()

            upload_folder = current_app.config["UPLOAD_FOLDER"]

            for file_obj in temp_files:
                file_path = os.path.join(upload_folder, file_obj.encoded_filename)
                if os.path.exists(file_path):
                    os.remove(file_path)

                db.session.delete(file_obj)

            db.session.commit()
            logging.info(f"Очищено {len(temp_files)} временных файлов")

        except Exception as e:
            logging.error(f"Ошибка очистки временных файлов: {e}")
            db.session.rollback()

    @staticmethod
    def prepare_email_data(data: dict[str, Any]) -> dict[str, Any]:
        """
        Метод подготовки данных для рендеринга HTML темплейта предпросмотра письма.

        Args:
            data: Данные для обработки

        Returns:
            Объект типа словарь с данными для рендеринга темплейта
        """
        try:
            if not data:
                return {
                    "status": "not_found",
                    "message": "Отсутствуют данные для сохранения CRQ."
                }

            templates_paths = {
                "users": "email/email_template_crq_users.html",
                "partners": "email/email_template_crq_partners.html"
            }

            template_key = data.get("template")
            if template_key not in templates_paths:
                return {
                    "status": "not_found",
                    "message": f"Темплейт {template_key}' не найден."
                }

            template = templates_paths[template_key]
            crq_data = data.get("data", {})

            if template_key == "users":
                required_fields = [
                    "crq_direction", "crq_impact", "crq_start_date",
                    "crq_end_date", "crq_cause", "crq_work_type",
                    "crq_number", "crq_impact_details", "subscriptions"
                ]
            else:
                required_fields = [
                    "textLetter", "partnerGroup"
                ]

            data_to_render = {}
            for field in required_fields:
                data_to_render[field] = crq_data.get(field, "")

            data_to_render["date_rage"] = helpers.format_duration_display(
                crq_data.get("crq_start_date"), crq_data.get("crq_end_date")
            )

            return {
                "status": "success",
                "template": template,
                "content": data_to_render
            }

        except Exception as e:
            logging.error(f"Ошибка генерации превью письма: {e}")
            return {
                "status": "error",
                "message": "Внутренняя ошибка сервера"
            }

    @track_operation("notification-process", "crq")
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
            prepared_template_data = CrqService.prepare_email_data(data)
            prepared_crq_data = prepared_template_data.get("content")
            if not prepared_template_data:
                return {
                    "status": "not_found",
                    "message": "Отсутствуют данные для сохранения CRQ."
                }

            if "subscriptions" in prepared_crq_data:
                users = CrqService._get_receivers_list(prepared_crq_data.get("subscriptions"))
                if not users:
                    return {
                        "status": "not_found",
                        "message": "Список получателей пуст."
                    }

                if not notification_manager.running:
                    notification_manager.start_worker()

                if notification_type == "email":
                    prepared_template_data.update({
                        "mail_subject": f"{prepared_crq_data.get('crq_work_type')} на оборудовании {prepared_crq_data.get('crq_direction')}",
                        "email_template_path": prepared_template_data.get("template"),
                    })
            else:
                partner_group = PartnerGroups.get_by_filter(partner_group_name=prepared_crq_data.get("partnerGroup"))
                if not partner_group:
                    return {
                        "status": "not_found",
                        "message": "Группа не найдена."
                    }

                users = PartnersEmails.get_all_by_filter_ordered(
                    'partner_email', 'asc',
                    partner_group_id=partner_group.partner_group_id
                )
                if not users:
                    return {
                        "status": "not_found",
                        "message": "Список почтовых адресов группы партнеров пуст."
                    }

                if not users:
                    return {
                        "status": "not_found",
                        "message": "Список получателей пуст."
                    }

                if not notification_manager.running:
                    notification_manager.start_worker()

                if notification_type == "email":
                    prepared_template_data.update({
                        "mail_subject": "Плановые работы на стороне Кар-Тел",
                        "email_template_path": prepared_template_data.get("template"),
                    })

            task_id = notification_manager.submit_task(notification_type, users, prepared_template_data, operator_ip,
                                                       created_by)

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

    @staticmethod
    def _process_files_without_commit(crq_id: int, files: ImmutableMultiDict[str, FileStorage]) -> list[dict[str, Any]]:
        """
        Внутренний метод обработки файлов без коммита.

        Args:
            crq_id: ID созданного CRQ
            files: Список файлов

        Returns:
            Список обработанных файлов в виде словарей
        """
        upload_folder = current_app.config["UPLOAD_FOLDER"]
        uploaded_files = []

        for file in files.getlist('files'):
            original_filename = file.filename
            _, extension = os.path.splitext(original_filename)
            encoded_filename = f"{uuid.uuid4()}{extension}"
            file_path = os.path.join(upload_folder, encoded_filename)
            file.save(file_path)

            attachment = CRQAttachments(
                crq_number=crq_id,
                original_filename=original_filename,
                encoded_filename=encoded_filename,
                upload_date=datetime.now()
            )
            db.session.add(attachment)
            db.session.flush()

            uploaded_files.append(attachment.to_dict())

        return uploaded_files

    @staticmethod
    def _link_existing_files_without_commit(crq_id: int, file_ids: list[int]) -> None:
        """
        Привязывает существующие временные файлы к CRQ без коммита

        Args:
            crq_id: ID созданного CRQ
            file_ids: Список ID файлов для привязки
        """
        for file_id in file_ids:
            file_obj = CRQAttachments.get_by_id(file_id)
            if file_obj and file_obj.crq_number is None:
                file_obj.crq_number = crq_id
                db.session.add(file_obj)

    @staticmethod
    def _delete_files_without_commit(file_ids: set[int]) -> None:
        """
        Внутренний метод удаления файлов без коммита.

        Args:
            file_ids: Множество ID файлов для удаления
        """
        upload_folder = current_app.config["UPLOAD_FOLDER"]

        for file_id in file_ids:
            file_obj = CRQAttachments.get_by_id(file_id)
            if file_obj:
                file_path = os.path.join(upload_folder, file_obj.encoded_filename)
                if os.path.exists(file_path):
                    try:
                        os.remove(file_path)
                    except OSError as e:
                        logging.warning(f"Не удалось удалить файл {file_path}: {e}")

                db.session.delete(file_obj)

    @staticmethod
    def _get_receivers_list(selected_subs: list[str]) -> list[Users]:
        """
        Метод сбора данных получателей рассылки по указанным тематикам.

        Args:
            selected_subs: Лист тематик подписок

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

            users = Users.query.filter(
                text("subscriptions -> 'maintenance_subs' ?| :sub_ids")
            ).params(sub_ids=selected_subs_ids).all()

            return users

        except Exception as e:
            raise Exception(f"Ошибка получения списка получателей: {e}")
import logging
from datetime import datetime
from typing import Any

from app.core.monitoring.decorators import track_operation
from app.core.models.partners_emails import PartnersEmails
from app.core.models.partners_groups import  PartnerGroups


class PartnersService:
    """Класс обработки операций над группами партнеров."""

    @staticmethod
    def get_partners_groups() -> dict[str, Any]:
        """Метод получения списка групп партнеров."""
        try:
            partner_groups = PartnerGroups.get_all_ordered('partner_group_name', 'asc')
            if not partner_groups:
                return {
                    "status": "not_found",
                    "message": "Список групп пуст."
                }

            groups_list = []
            for group in partner_groups:
                group_item = {"groupname": group.partner_group_name}
                groups_list.append(group_item)

            return {
                "status": "success",
                "message": "Группы найдены.",
                "groups": groups_list
            }

        except Exception as e:
            logging.error(f"Ошибка получения списка групп партнеров: {e}")
            return {
                "status": "error",
                "message": f"Ошибка получения списка групп партнеров"
            }

    @staticmethod
    def get_group_members(groupname: str) -> dict[str, Any]:
        """
        Метод получения списка участников группы.

        Args:
            groupname: Имя группы

        Returns:
            Объект типа dict с данными об участниках группы, или данные об ошибке
        """
        try:
            partner_group = PartnerGroups.get_by_filter(partner_group_name=groupname)
            if not partner_group:
                return {
                    "status": "not_found",
                    "message": "Группа не найдена."
                }

            group_members = PartnersEmails.get_all_by_filter_ordered(
                'partner_email', 'asc',
                partner_group_id=partner_group.partner_group_id
            )
            if not group_members:
                return {
                    "status": "not_found",
                    "message": "Список почтовых адресов группы партнеров пуст."
                }

            members_emails = []
            for group_member in group_members:
                member_item = {"email": group_member.partner_email}
                members_emails.append(member_item)

            return {
                "status": "success",
                "message": "Участники найдены",
                "partners": members_emails
            }

        except Exception as e:
            logging.error(f"Ошибка получения списка участников группы партнеров: {e}")
            return {
                "status": "error",
                "message": f"Ошибка получения списка участников группы партнеров"
            }

    @track_operation("partners-group-create", "partners")
    @staticmethod
    def add_new_group(data: dict[str, str]) -> dict[str, Any]:
        """
        Метод добавления новой группы.

        Args:
            data: Словарь с данными для создания нового участника
        """
        try:
            group_name = data.get("groupname")

            partner_group = PartnerGroups.get_by_filter(partner_group_name=group_name)
            if partner_group:
                return {
                    "status": "not_found",
                    "message": "Группа с таким именем уже существует."
                }

            PartnerGroups.create(
                partner_group_name=group_name,
                created_at=datetime.now()
            )

            return {"status": "success","message": "Группа успешно создана"}
        except Exception as e:
            logging.error(f"Ошибка добавления группы: {e}")
            return {
                "status": "error",
                "message": f"Ошибка добавления группы"
            }

    @track_operation("partners-group-delete", "partners")
    @staticmethod
    def delete_partner_group(data: dict[str, str]) -> dict[str, Any]:
        """Метод удаления группы партнера."""
        try:
            group_name = data.get("groupname")

            partner_group = PartnerGroups.get_by_filter(partner_group_name=group_name)
            if not partner_group:
                return {
                    "status": "not_found",
                    "message": "Группа не найдена."
                }

            partner_group.delete()

            return {"status": "success", "message": "Группа успешно удалена"}
        except Exception as e:
            logging.error(f"Ошибка удаления группы партнера: {e}")
            return {
                "status": "error",
                "message": f"Ошибка удаления группы партнера"
            }

    @track_operation("partners-group-member-create", "partners")
    @staticmethod
    def add_partner_into_group(data: dict[str, str]) -> dict[str, Any]:
        """Метод добавления почтового адреса в группу партнеров."""
        try:
            partner_email = data.get("email")
            partner_group = data.get("groupname")

            group_name = PartnerGroups.get_by_filter(partner_group_name=partner_group)
            if not group_name:
                return {
                    "status": "not_found",
                    "message": f"Группа {partner_group} не найдена."
                }

            PartnersEmails.create(partner_email=partner_email, partner_group_id=group_name.partner_group_id)

            return {"status": "success", "message": "Пользователь успешно добавлен."}
        except Exception as e:
            logging.error(f"Ошибка добавления почтового адреса в группу партнеров: {e}")
            return {
                "status": "error",
                "message": f"Ошибка добавления почтового адреса в группу партнеров"
            }

    @track_operation("partners-group-members-update", "partners")
    @staticmethod
    def update_partner_info(data: dict[str, Any]) -> dict[str, Any]:
        """Метод обновления списка участников группы."""
        try:
            groupname = data.get("groupname")
            current_partners = data.get("partners", [])
            removed_partners = data.get("removed_partners", [])

            if not groupname:
                return {"status": "error", "message": "Название группы обязательно"}

            group = PartnerGroups.get_by_filter(partner_group_name=groupname)
            if not group:
                return {"status": "error", "message": f"Группа '{groupname}' не найдена"}

            for email in removed_partners:
                partner = PartnersEmails.get_by_filter(
                    partner_email=email,
                    partner_group_id=group.partner_group_id
                )
                if partner:
                    partner.delete()
                    logging.info(f"Удален партнер {email} из группы {groupname}")
                else:
                    logging.warning(f"Партнер {email} не найден в группе {groupname}")

            existing_partners = PartnersEmails.get_all_by_filter(partner_group_id=group.partner_group_id)
            existing_emails = {p.partner_email for p in existing_partners}

            for email in current_partners:
                if email not in existing_emails:
                    PartnersEmails.create(
                        partner_email=email,
                        partner_group_id=group.partner_group_id
                    )
                    logging.info(f"Добавлен отсутствующий партнер {email} в группу {groupname}")

            return {"status": "success", "message": "Изменения успешно сохранены"}

        except Exception as e:
            logging.error(f"Ошибка обновления списка участников группы: {e}")
            return {
                "status": "error",
                "message": "Ошибка обновления информации о партнере"
            }

    @staticmethod
    def update_partner_emails_from_file(data: dict[str, Any]) -> dict[str, Any]:
        """Метод добавления почтовых адресов по списку из входящего файла."""
        try:
            groupname = data.get('groupname')
            file_content = data.get('file_content')

            if not groupname or not file_content:
                return {"status": "error", "message": "Группа и содержимое файла обязательны"}

            emails = []
            for line in file_content.strip().split('\n'):
                email = line.strip()
                if email and '@' in email:
                    emails.append(email)

            if not emails:
                return {"status": "error", "message": "В файле не найдено корректных email адресов"}

            existing_partners_result = PartnersService.get_group_members(groupname)
            existing_emails = []

            if existing_partners_result.get('partners'):
                existing_emails = [p['email'] for p in existing_partners_result['partners']]

            all_emails = list(set(existing_emails + emails))

            update_data = {
                "groupname": groupname,
                "partners": all_emails,
                "removed_partners": []
            }

            result = PartnersService.update_partner_info(update_data)

            if result.get("status") == "success":
                added_count = len(emails) - len([e for e in emails if e in existing_emails])
                if added_count > 0:
                    result["message"] = f"Добавлено новых пользователей: {added_count}"
                else:
                    result["message"] = "Все пользователи из файла уже существуют в группе"

            return result

        except Exception as e:
            logging.error(f"Ошибка загрузки файла: {e}")
            return {
                "status": "error",
                "message": "Ошибка загрузки файла"
            }
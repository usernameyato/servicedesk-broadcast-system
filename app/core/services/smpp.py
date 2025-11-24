from flask import current_app
import smpplib.client
import smpplib.gsm
from smpplib.exceptions import ConnectionError, PDUError
from time import sleep
import logging
import threading
import time
import socket


class SMPPConnector:
    """Класс SMPP клиента."""

    def __init__(self):
        """Инициализация инстанса SMPP."""
        self.smpp_host = current_app.config["SMPP_HOST"]
        self.smpp_port = current_app.config["SMPP_PORT"]
        self.smpp_system_id = current_app.config["SMPP_SYSTEM_ID"]
        self.smpp_password = current_app.config["SMPP_PASSWORD"]
        self.smpp_sender = current_app.config["SMPP_SENDER"]
        self.smpp_part_delay = current_app.config.get("SMPP_PART_DELAY", 0.2)

        self.smpp_connection = None
        self.messages_ids = []
        self._stop_listening = False
        self._listener_thread = None

    def __enter__(self):
        """
        Точка входа контекстного менеджера.
        Позволяет вызывать инстанс с оператором with().
        """
        try:
            self.smpp_connection = smpplib.client.Client(
                self.smpp_host,
                self.smpp_port,
                timeout=10
            )
            self.smpp_connection.connect()
            self.smpp_connection.bind_transceiver(
                system_id=self.smpp_system_id,
                password=self.smpp_password
            )

            self.smpp_connection.set_message_sent_handler(handle_submit_sm_resp)
            self.smpp_connection.set_message_received_handler(handle_deliver_sm)
            self.smpp_connection.set_error_pdu_handler(handle_pdu_error)

            logging.info("Соединение с SMS установлено.")

            self._start_background_listener()

            return self
        except ConnectionError as e:
            raise ConnectionError(f"Ошибка подключения к SMS центру: {e}")
        except Exception as e:
            raise Exception(f"Произошла неизвестная ошибка во время установки SMPP соединения: {e}")

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Точка выхода контекстного менеджера."""
        if self.smpp_connection:
            self._stop_background_listener()

            self._final_cleanup()

            self.smpp_connection.unbind()
            self.smpp_connection.disconnect()
            self.smpp_connection = None
            logging.info("Соединение с SMS центром завершено.")

    def _start_background_listener(self):
        self._stop_listening = False
        self._listener_thread = threading.Thread(target=self._listen_for_pdu, daemon=True)
        self._listener_thread.start()

    def _stop_background_listener(self):
        """Остановка фонового потока."""
        self._stop_listening = True
        if self._listener_thread and self._listener_thread.is_alive():
            self._listener_thread.join(timeout=2)

    def _listen_for_pdu(self):
        """Фоновое прослушивание PDU для delivery reports."""
        while not self._stop_listening and self.smpp_connection:
            try:
                self.smpp_connection.read_once(auto_send_enquire_link=False)
            except socket.timeout:
                continue
            except Exception as e:
                if not self._stop_listening:
                    logging.debug(f"Background listener error (normal during shutdown): {e}")
                break

    def _final_cleanup(self, wait_time: int = 2):
        """
        Внутренний метод очистки очереди PDU перед закрытием соединения.
        Ждет последние delivery reports.
        """
        logging.info("Ожидание финальных delivery reports...")
        end_time = time.time() + wait_time

        while time.time() < end_time:
            try:
                self.smpp_connection.read_once(auto_send_enquire_link=False)
            except socket.timeout:
                break
            except Exception as e:
                raise PDUError(f"Ошибка чтения PDU во время: {e}")

        logging.info("Финальная очистка завершена")

    def send_sms(self, receiver: str, sms_text: str) -> None:
        """
        Метод генерации части СМС и отправка.

        Args:
            receiver: Телефонный номер получателя
            sms_text: Цельный текст СМС для отправки
        """
        try:
            parts, encoding_flag, msg_type_flag = smpplib.gsm.make_parts(sms_text)

            for i, part in enumerate(parts):
                self.smpp_connection.send_message(
                    source_addr_ton=5,
                    source_addr=self.smpp_sender,
                    dest_addr_ton=7,
                    destination_addr=receiver,
                    short_message=part,
                    data_coding=encoding_flag,
                    esm_class=msg_type_flag,
                    registered_delivery=True,
                )

                if i < len(parts) - 1:
                    sleep(self.smpp_part_delay)

            logging.info(f"СМС с текстом \"{sms_text}\" отправлено на номер {receiver}.")

        except PDUError as e:
            raise PDUError(f"Ошибка PDU: {e}")
        except Exception as e:
            raise Exception(f"Ошибка при отправке сообщения: {e}")


def handle_submit_sm_resp(pdu):
    """Обработчик события отправки команды PDU sm_resp."""
    if not pdu.is_error():
        logging.info(
            f"Message {pdu.message_id} sent with {pdu.command} in sequence {pdu.sequence}. Status: {pdu.status}")
    else:
        logging.error(
            f"Error '{pdu.status}' occurred while sending a message with {pdu.command} in sequence {pdu.sequence}."
            f"Error description: {pdu.get_status_desc()}")


def handle_deliver_sm(pdu):
    """Обработчик события отправки команды PDU deliver_sm."""
    logging.info(f"Command {pdu.command} received within sequence {pdu.sequence}. Status: {pdu.status}")
    logging.info(f"Delivery report: {pdu.short_message}")

    if hasattr(pdu, 'receipted_message_id') and pdu.receipted_message_id:
        logging.info(f"Delivery Report for Message ID: {pdu.receipted_message_id}."
                     f"Message State: {pdu.message_state}. Network Error: {pdu.network_error_code}")
    else:
        logging.info(f"Regular incoming SMS message.")


def handle_pdu_error(pdu):
    """Обработчик событий ошибок PDU."""
    logging.error(f"PDU error. Command: {pdu.command}. Sequence: {pdu.sequence}. Status: {pdu.status}")

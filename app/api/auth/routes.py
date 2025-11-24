from flask import render_template, redirect, url_for, request, jsonify, session
from flask_login import login_user, logout_user, current_user
import logging

from app.api.auth import bp
from app.core.services.auth import AuthService


def handle_json_login():
    """Обработка REST API запроса."""
    try:
        data = request.get_json()

        username = data.get("username", "").strip().lower()
        password = data.get("password", "")

        errors = {}

        if not username:
            errors["username"] = ["Имя пользователя обязательно"]

        if not password:
            errors["password"] = ["Пароль обязателен"]

        if errors:
            return jsonify({
                "success": False,
                "errors": errors
            }), 400

        user = AuthService.authenticate_user(username, password)

        if user:
            login_user(user)
            session.permanent = True
            logging.info(f"{username} успешно авторизовался через AJAX.")

            return jsonify({
                "success": True,
                "message": "Вход выполнен успешно",
                "redirect": url_for("main.subs_dashboard")
            })
        else:
            return jsonify({
                "success": False,
                "message": "Неверное имя пользователя или пароль"
            }), 401

    except Exception as e:
        logging.error(f"Ошибка AJAX авторизации: {e}")
        return jsonify({
            "success": False,
            "message": "Произошла ошибка при входе в систему"
        }), 500

def handle_form_login():
    """Обработка запроса формы."""
    username = request.form.get("username", "").strip().lower()
    password = request.form.get("password", "")

    if not username or not password:
        return redirect(url_for("auth.login"))

    user = AuthService.authenticate_user(username, password)

    if user:
        login_user(user)
        session.permanent = True
        logging.info(f"{username} успешно авторизовался через форму.")
        return redirect(url_for("main.subs_dashboard"))
    else:
        return redirect(url_for("auth.login"))

@bp.route("/login", methods=["GET", "POST"])
def login():
    if current_user.is_authenticated:
        return redirect(url_for("main.subs_dashboard"))

    if request.method == "GET":
        return render_template("login.html", title="Login")

    if request.is_json:
        return handle_json_login()
    else:
        return handle_form_login()

@bp.route("/logout")
def logout():
    logout_user()
    return redirect(url_for("auth.login"))
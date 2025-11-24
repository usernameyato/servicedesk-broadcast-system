from flask import request, render_template, jsonify
from flask_login import login_required, current_user

from app.api.inc import bp
from app.extensions import notification_manager
from app.core.services.auth import role_required
from app.core.services.inc import IncidentService
from app.core.services.subscriptions import SubscriptionsService


@bp.route("/inc_sbs", methods=["GET"])
@login_required
@role_required("admin")
def inc_sbs():
    return render_template("inc_sbs.html")

@bp.route("/api/subscriptions", methods=["GET"])
@login_required
@role_required("admin")
def get_subscriptions():
    subscriptions = SubscriptionsService.get_subs_list()

    if isinstance(subscriptions, dict) and subscriptions["status"] == "not_found":
        return jsonify(subscriptions), 404
    if isinstance(subscriptions, dict) and subscriptions["status"] == "error":
        return jsonify(subscriptions), 500

    return jsonify(subscriptions), 200

@bp.route("/api/search", methods=["POST"])
@login_required
@role_required("admin")
def search_incident():
    data = request.get_json()

    inc_number = data.get("inc_number")

    if not inc_number:
        return jsonify({"error": "Необходимо указать номер инцидента."}), 400

    result = IncidentService.get_inc_data(inc_number, parse_description=True)

    if "rejected" in result:
        return jsonify(result), 400
    if "not_found" in result:
        return jsonify(result), 404
    if "error" in result:
        return jsonify(result), 500

    return jsonify(result), 200

@bp.route("/api/message/generate", methods=["POST"])
@login_required
@role_required("admin")
def generate_message():
    data = request.get_json()

    result = IncidentService.prepare_notification(data)

    if "rejected" in result:
        return jsonify(result), 400
    if "not_found" in result:
        return jsonify(result), 404
    if "unknown" in result:
        return jsonify(result), 500

    return jsonify(result), 200

@bp.route('/api/sms/send_async', methods=["POST"])
@login_required
@role_required("admin")
def send_sms_async():
    try:
        operator_ip = request.remote_addr
        created_by = current_user.user_login

        data = request.get_json()

        result = IncidentService.process_notification_async('sms', data, operator_ip, created_by)

        return jsonify(result)
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": f"Server error: {str(e)}"
        }), 500

@bp.route('/api/email/send_async', methods=["POST"])
@login_required
@role_required("admin")
def send_email_async():
    try:
        operator_ip = request.remote_addr
        created_by = current_user.user_login

        data = request.get_json()

        result = IncidentService.process_notification_async('email', data, operator_ip, created_by)

        return jsonify(result)
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": f"Server error: {str(e)}"
        }), 500

@bp.route('/api/task/status/<task_id>', methods=["GET"])
@login_required
@role_required("admin")
def get_task_status(task_id):
    try:
        result = IncidentService.get_notification_status(task_id)
        return jsonify(result)
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": f"Server error: {str(e)}"
        }), 500

@bp.route('/api/tasks', methods=["GET"])
@login_required
@role_required("admin")
def get_all_tasks():
    try:
        tasks = notification_manager.get_all_tasks(limit=100, include_completed=True)
        return jsonify({
            "status": "success",
            "tasks": tasks
        })
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": f"Server error: {str(e)}"
        }), 500
from flask import request, jsonify, render_template
from flask_login import login_required, current_user
from flask_socketio import join_room, leave_room
import logging

from app.api.crq import bp
from app.core.services.auth import role_required
from app.core.services.crq import CrqService
from app.core.services.partners import PartnersService
from app.core.services.subscriptions import SubscriptionsService
from app.extensions import socketio, lock_manager


# Пути обработки CRQ
@bp.route("/crq_sbs", methods=["GET"])
@login_required
@role_required("admin")
def crq_sbs():
    return render_template("crq_sbs.html", current_user=current_user)

@bp.route("/api/calendar", methods=["GET"])
@login_required
@role_required("admin")
def get_calendar():
    service = request.args.get("service", "td")
    start_date = request.args.get("startDate")
    end_date = request.args.get("endDate")

    result = CrqService.get_calendar_data(service, start_date, end_date)

    if result["status"] == "error":
        return jsonify(result), 500

    return jsonify(result)

@bp.route("/api/find/<string:crq_number>", methods=["GET"])
@login_required
@role_required("admin")
def get_crq(crq_number: str):
    source = request.args.get("source")

    result = CrqService.get_crq_data(crq_number, source)

    if result["status"] == "not_found":
        return jsonify(result), 404
    if result["status"] == "error":
        return jsonify(result), 500

    return jsonify(result), 200

@bp.route("/api/create", methods=["POST"])
@login_required
@role_required("admin")
def create_crq():
    data = request.get_json()
    files = request.files if request.files else None

    result = CrqService.add_crq_with_files(data, files)

    if result["status"] == "conflict":
        return jsonify(result), 409
    if result["status"] == "not_found":
        return jsonify(result), 404
    if result["status"] == "error":
        return jsonify(result), 500

    return jsonify(result), 200

@bp.route("/api/update/<string:crq_number>", methods=["POST"])
@login_required
@role_required("admin")
def update_crq(crq_number: str):
    data = request.get_json()
    files = request.files if request.files else None

    result = CrqService.update_crq(crq_number, data, files)

    if result["status"] == "conflict":
        return jsonify(result), 409
    if result["status"] == "not_found":
        return jsonify(result), 404
    if result["status"] == "error":
        return jsonify(result), 500

    return jsonify(result), 200


# Пути загрузки ресурсов
@bp.route("/api/resources/subscriptions", methods=["GET"])
@login_required
@role_required("admin")
def get_subscriptions():
    subscriptions = SubscriptionsService.get_subs_list()

    if isinstance(subscriptions, dict) and subscriptions["status"] == "not_found":
        return jsonify(subscriptions), 404
    if isinstance(subscriptions, dict) and subscriptions["status"] == "error":
        return jsonify(subscriptions), 500

    return jsonify(subscriptions), 200

@bp.route("/api/resources/partner-groups", methods=["GET"])
@login_required
@role_required("admin")
def get_partner_groups():
    result = PartnersService.get_partners_groups()

    if result["status"] == "not_found":
        return jsonify(result), 404
    if result["status"] == "error":
        return jsonify(result), 500

    return jsonify(result), 200


# Пути загрузки файлов
@bp.route("/api/files/upload", methods=["POST"])
@login_required
@role_required("admin")
def upload_files():
    crq_number = request.form.get('crqNumber')
    uploaded_files = request.files

    if crq_number:
        result = CrqService.upload_files(crq_number, uploaded_files)
    else:
        result = CrqService.upload_temporary_files(uploaded_files)

    if result["status"] == "not_found":
        return jsonify(result), 404
    if result["status"] == "error":
        return jsonify(result), 500

    return jsonify(result), 200

@bp.route("/api/files/delete/<int:file_id>", methods=["POST"])
@login_required
@role_required("admin")
def delete_file(file_id: int):
    result = CrqService.delete_file(file_id)

    if result["status"] == "not_found":
        return jsonify(result), 404
    if result["status"] == "error":
        return jsonify(result), 500

    return jsonify(result), 200

@bp.route("/api/files/cleanup", methods=["POST"])
@login_required
@role_required("admin")
def cleanup_temporary_files():
    try:
        CrqService.cleanup_temporary_files()
        return jsonify({"status": "success", "message": "Временные файлы очищены"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


# Пути обработки EMail
@bp.route("/api/email/preview", methods=["POST"])
@login_required
@role_required("admin")
def preview_email():
    data = request.get_json()

    result = CrqService.prepare_email_data(data)

    if result["status"] == "not_found":
        return jsonify(result), 404
    if result["status"] == "error":
        return jsonify(result), 500

    try:
        template = result["template"]
        template_data = result["content"]
        html_content = render_template(template, content=template_data)
        return jsonify({
            "status": "success",
            "content": html_content
        })
    except Exception as e:
        logging.error(f"Ошибка рендеринга темплейта: {e}")
        return jsonify({
            "status": "error",
            "message": "Ошибка рендеринга предпросмотра"
        }), 500

@bp.route('/api/email/send_async', methods=["POST"])
@login_required
@role_required("admin")
def send_email_async():
    try:
        operator_ip = request.remote_addr
        created_by = current_user.user_login

        data = request.get_json()

        result = CrqService.process_notification_async('email', data, operator_ip, created_by)

        return jsonify(result)
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": f"Server error: {str(e)}"
        }), 500


# Пути обработки блокировок
@bp.route("/api/locks/<string:crq_number>", methods=["POST"])
@login_required
@role_required("admin")
def acquire_crq_lock(crq_number: str):
    data = request.get_json()
    user_id = data.get('user_id')
    user_name = data.get('user_name')
    session_id = data.get('session_id')
    duration = data.get('duration')

    if not all([user_id, user_name, session_id]):
        return jsonify({'error': 'Missing required fields'}), 400

    success, existing_lock = lock_manager.acquire_lock(
        crq_number, user_id, user_name, session_id, duration
    )

    if success:
        socketio.emit('crq_locked', {
            'crq_number': crq_number,
            'user_id': user_id,
            'user_name': user_name
        }, room=f'crq_{crq_number}')

        return jsonify({
            'success': True,
            'message': 'Lock acquired successfully'
        })
    else:
        return jsonify({
            'success': False,
            'message': f'CRQ is locked by {existing_lock.user_name}',
            'locked_by': existing_lock.to_dict()
        }), 409

@bp.route("/api/locks/<string:crq_number>", methods=["DELETE"])
@login_required
@role_required("admin")
def release_crq_lock(crq_number: str):
    data = request.get_json()
    user_id = data.get('user_id')
    session_id = data.get('session_id')

    if not all([user_id, session_id]):
        return jsonify({'error': 'Missing required fields'}), 400

    success = lock_manager.release_lock(crq_number, user_id, session_id)

    if success:
        socketio.emit('crq_unlocked', {
            'crq_number': crq_number
        }, room=f'crq_{crq_number}')

        return jsonify({
            'success': True,
            'message': 'Lock released successfully'
        })
    else:
        return jsonify({
            'success': False,
            'message': 'Lock not found or not owned by user'
        }), 404

@bp.route('/api/locks/<string:crq_number>', methods=['PUT'])
@login_required
@role_required("admin")
def extend_crq_lock(crq_number: str):
    data = request.get_json()
    user_id = data.get('user_id')
    session_id = data.get('session_id')
    duration = data.get('duration')

    success = lock_manager.extend_lock(crq_number, user_id, session_id, duration)

    return jsonify({
        'success': success,
        'message': 'Lock extended successfully' if success else 'Failed to extend lock'
    })

@bp.route('/api/locks/<string:crq_number>', methods=['GET'])
@login_required
@role_required("admin")
def get_crq_lock_status(crq_number: str):
    status, lock_info = lock_manager.get_lock_status(crq_number)

    return jsonify({
        'status': status.value,
        'lock_info': lock_info.to_dict() if lock_info else None
    })

@bp.route('/api/locks', methods=['GET'])
@login_required
@role_required("admin")
def get_all_locks():
    locks = lock_manager.get_all_locks()
    return jsonify({
        lock_crq: lock_info.to_dict()
        for lock_crq, lock_info in locks.items()
    })


@socketio.on('connect')
def handle_connect():
    logging.info(f'Client connected: {request.sid}')

@socketio.on('disconnect')
def handle_disconnect():
    session_id = request.sid

    locks = lock_manager.get_all_locks()
    for crq_number, lock_info in locks.items():
        if lock_info.session_id == session_id:
            lock_manager.release_lock(crq_number, lock_info.user_id, session_id)
            socketio.emit('crq_unlocked', {
                'crq_number': crq_number
            }, room=f'crq_{crq_number}')

@socketio.on('subscribe_crq')
def handle_subscribe_crq(data):
    crq_number = data.get('crq_number')
    if crq_number:
        join_room(f'crq_{crq_number}')

@socketio.on('unsubscribe_crq')
def handle_unsubscribe_crq(data):
    crq_number = data.get('crq_number')
    if crq_number:
        leave_room(f'crq_{crq_number}')
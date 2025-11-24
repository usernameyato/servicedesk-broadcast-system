from flask import request, render_template, jsonify
from flask_login import login_required

from app.api.admin import bp
from app.core.services.auth import role_required
from app.core.services.feedback import FeedbacksService
from app.core.services.partners import PartnersService
from app.core.utils import helpers


@bp.route("/users_feedbacks", methods=["GET"])
@login_required
@role_required("admin")
def users_feedbacks():
    feedbacks = FeedbacksService.get_all_feedbacks("feedback_id", "desc")

    return render_template("users_feedbacks.html", feedbacks=feedbacks)

@bp.route("/api/feedbacks/reply", methods=["POST"])
@login_required
@role_required("admin")
def post_reply():
    data = request.form

    status = FeedbacksService.reply_on_feedback(data)
    if "error" in status:
        return jsonify(status), 500

    return jsonify(status), 200

@bp.route("/partner_panel", methods=["GET"])
@login_required
@role_required("admin")
def partners_panel():
    return render_template("partners_panel.html")

@bp.route("/api/groups", methods=["GET"])
@login_required
@role_required("admin")
def load_groups():
    result = PartnersService.get_partners_groups()

    if result["status"] == "error":
        return jsonify(result), 500

    if result["status"] == "not_found":
        return jsonify(result), 404

    return jsonify(result), 200

@bp.route("/api/groups/<groupname>/partners", methods=["GET"])
@login_required
@role_required("admin")
def load_group_members(groupname):
    result = PartnersService.get_group_members(groupname)

    if result["status"] == "error":
        return jsonify(result), 500

    if result["status"] == "not_found":
        return jsonify(result), 404

    return jsonify(result), 200

@bp.route("/api/groups/add", methods=["POST"])
@login_required
@role_required("admin")
def add_group():
    data = request.get_json()

    result = PartnersService.add_new_group(data)

    if result["status"] == "error":
        return jsonify(result), 500

    return jsonify(result), 200

@bp.route("/api/groups/delete", methods=["POST"])
@login_required
@role_required("admin")
def delete_group():
    data = request.get_json()

    result = PartnersService.delete_partner_group(data)

    if result["status"] == "error":
        return jsonify(result), 500

    if result["status"] == "not_found":
        return jsonify(result), 404

    return jsonify(result), 200

@bp.route("/api/partners/add", methods=["POST"])
@login_required
@role_required("admin")
def add_partner():
    data = request.get_json()

    result = PartnersService.add_partner_into_group(data)

    if result["status"] == "error":
        return jsonify(result), 500

    return jsonify(result), 200

@bp.route("/api/partners/manage", methods=["POST"])
@login_required
@role_required("admin")
def manage_partner():
    data = request.get_json()

    result = PartnersService.update_partner_info(data)

    if result["status"] == "error":
        return jsonify(result), 500

    return jsonify(result), 200

@bp.route("/api/partners/upload", methods=["POST"])
@login_required
@role_required("admin")
def upload_from_file():
    data = request.get_json()

    result = PartnersService.update_partner_emails_from_file(data)

    if result["status"] == "error":
        return jsonify(result), 500

    return jsonify(result), 200

@bp.route("/api/update_sbs_users", methods=["POST"])
def update_sbs_users():
    result = helpers.process_users_update()

    if result["status"] == "error":
        return jsonify(result), 500

    return jsonify(result), 200

# @bp.route("/api/send_deferred_sms", methods=["POST"])
# def send_deferred_sms():
#     result = helpers.send_deferred_messages()
#
#     if result["status"] == "error":
#         return jsonify(result), 500
#
#     return jsonify(result), 200

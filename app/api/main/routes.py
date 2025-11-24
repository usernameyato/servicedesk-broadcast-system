from flask import request, render_template, jsonify
from flask_login import login_required, current_user

from app.api.main import bp
from app.core.services.feedback import FeedbacksService
from app.core.services.subscriptions import SubscriptionsService


@bp.route("/")
@bp.route("/subs_dashboard")
@login_required
def subs_dashboard():
    return render_template("subs_dashboard.html")

@bp.route("/api/subscriptions", methods=["GET"])
@login_required
def get_subscriptions():
    status = SubscriptionsService.load_user_subscriptions()

    if "error" in status:
        return jsonify(status["error"]), 500

    return jsonify(status), 200

@bp.route("/api/subscriptions/update", methods=["POST"])
@login_required
def update_subscriptions():
    data = request.get_json()

    if not data:
        return jsonify({'error': 'Отсутствуют данные для обработки.'}), 400

    status = SubscriptionsService.process_subscription_settings(data)
    if "error" in status:
        return jsonify(status["error"]), 500

    return jsonify(status), 200

@bp.route("/feedback", methods=["GET"])
@login_required
def feedbacks():
    user_feedbacks = FeedbacksService.get_users_feedbacks(
        "feedback_id",
        "desc",
        username=current_user.user_login
    )
    formatted_user_feedbacks = FeedbacksService.get_formatted_feedbacks(user_feedbacks)

    return render_template("feedback_list.html", feedbacks=formatted_user_feedbacks)

@bp.route("/api/feedback/send", methods=["POST"])
@login_required
def post_feedback():
    data = request.get_json()

    status = FeedbacksService.post_feedback(data)
    if "error" in status:
        return jsonify(status["error"]), 500

    return jsonify(status), 200
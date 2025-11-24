import logging.config
from flask import Flask, request, redirect

from app.extensions import db, mail, login_manager, notification_manager, socketio, prometheus_metrics, metrics_middleware


def create_app():
    app = Flask(__name__)

    from app.config import get_config
    config = get_config()
    app.config.from_object(config)

    logging.config.dictConfig(app.config["LOGGING_CONF"])

    db.init_app(app)
    mail.init_app(app)
    login_manager.init_app(app)
    notification_manager.init_app(app)
    socketio.init_app(
        app,
        cors_allowed_origins="*",
        message_queue=app.config["REDIS_URL"],
        async_mode="eventlet",
        ping_interval=25,
        ping_timeout=20,
    )

    prometheus_metrics.init_app(app)
    metrics_middleware.init_app(app)

    from app.api.main import bp as main_bp
    app.register_blueprint(main_bp)

    from app.api.auth import bp as auth_bp
    app.register_blueprint(auth_bp, url_prefix="/auth")

    from app.api.admin import bp as admin_bp
    app.register_blueprint(admin_bp, url_prefix="/admin")

    from app.api.crq import bp as crq_bp
    app.register_blueprint(crq_bp, url_prefix="/crq")

    from app.api.inc import bp as inc_bp
    app.register_blueprint(inc_bp, url_prefix="/inc")
    
    @app.before_request
    def redirect_to_domain():
        """Редирект с прямого обращения по IP на домен"""
        # Если обращение по IP и НЕ от nginx proxy
        if request.host == '172.28.83.219:5002' and not request.headers.get('X-Forwarded-Proto'):
            return redirect(f'https://sbs.beeline.kz{request.path}', code=301)
    return app

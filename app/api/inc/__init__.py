from flask import Blueprint

bp = Blueprint("inc", __name__)

from app.api.inc import routes
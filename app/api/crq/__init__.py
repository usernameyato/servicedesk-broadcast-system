from flask import Blueprint

bp = Blueprint("crq", __name__)

from app.api.crq import routes
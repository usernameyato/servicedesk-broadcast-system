# ServiceDesk Notification System

A web application that facilitates the process of notifying company users and partners about planned work and high-priority incidents affecting system operability.

## Features

### User Features
- **ADFS Authentication**: Secure login through Active Directory Federation Services
- **Notification Preferences**: Users can select which types of notifications they wish to receive
- **Feedback System**: Leave and track feedback on notifications and system features

### Admin Features
- **Feedback Management**: Respond to user reviews and feedback
- **Partner Group Management**: Include/exclude email addresses in partner notification groups
- **Notification Management**:
  - Search for planned work/incidents in the database
  - Edit notification data and templates
  - Preview SMS messages and emails before sending
  - Send notifications via SMS and/or email

### Technical Features
- Integration with company mail server
- Integration with company ADFS server
- Integration with SMS center for text notifications
- PostgreSQL database for data persistence

## Technology Stack

- **Backend**: Python with Flask framework
- **Database**: PostgreSQL
- **Frontend**: JavaScript, JQuery, HTML
- **Authentication**: ADFS integration
- **Deployment**: Systemd service management

## Installation

### Prerequisites
- Python 3.1x
- PostgreSQL 10.x
- Access to company ADFS, mail server, and SMS center

### Setup

1. Clone the repository
2. Create and activate a virtual environment
3. Install dependencies
4. Configure database connection and other services in `config.py`
5. Create systemd service file
6. Add the following configuration to the service file
7. Enable and start the service
8. Verify the service is running

## Usage

### Accessing the Application
After installation, the web application can be accessed at `http://your-server-address:port` (default port is typically 5000 unless configured differently in gunicorn_config.py).

### For Users
1. Log in using your company credentials through ADFS
2. Navigate to "Notification Preferences" to select which alerts you want to receive
3. View past notifications in the "Notification History" section
4. Submit feedback through the "Feedback" section

### For Administrators
1. Log in using your company credentials with admin privileges
2. Access the admin dashboard from the navigation menu
3. Manage users, partner groups, and notification templates
4. Create and send new notifications:
   - Select notification type (planned work/incident)
   - Fill in relevant details
   - Preview message content
   - Select target audience
   - Send via email, SMS, or both

## Configuration

Key configuration files:
- `config.py` - Main application configuration
- `gunicorn_config.py` - Web server configuration
- `.env` (create this file) - Environment variables and secrets

Required environment variables:
```
# App configuration
SECRET_KEY = '...'                      # String. Application's secret key
UPLOAD_FOLDER = 'uploads'               # String. Files upload folder

# PostgreSQL database connection
DATABASE_URL = '...'                    # String. URL to the postgresql db. Example: postgresql+psycopg2://user:password@host:posrt/dbname

# Active Directory connection
AD_SERVER = '...'                       # String. AD server hostname/ip
AD_DOMAIN = '...'                       # String. AD domain
AD_BASE_DN = '...'                      # String. AD DN string. Example: 'OU=...,DC=...,DC=...'
AD_USER_SSL = ...                       # Bool. AD ssl verify

#Active Direcotry technical user credentials
ADMIN_USERNAME = '...'                  # String. Tech account without domain (e.g. @my-domain.com)
ADMIN_PASSWORD = '...'                  # String. TA password

# Mail server connection
MAIL_SERVER = '...'                     # String. Mail server hostname/ip
MAIL_PORT = ...                         # Integer. Mail server port
MAIL_USE_TLS = ...                      # Bool. Mail server tls verify
MAIL_USE_SSL = ...                      # Bool. Mail server ssl verify
MAIL_USERNAME = '...'                   # String. Username for connecting to mail server
MAIL_DEFAULT_SENDER = '...'             # String. Default sender if 'sender' argument is empty

# SMSCenter connetion
SMPP_HOST = '...'                       # String. SMS center's  hostname/ip
SMPP_PORT = ...                         # Integer. SMS center's  port
SMPP_SYSTEM_ID = '...'                  # String. Your SMS center's system name
SMPP_PASSWORD = '...'                   # String. Your password
SMPP_SENDER = '...'                     # String. SMS sender name
```

## Development

### Setting Up Development Environment
1. Follow the installation steps but use `FLASK_ENV=development`
2. Run the application with:
   ```bash
   python3 run.py
   ```

### Project Structure
```
/
├── app/
│   ├── __init__.py           # Applications factory
│   ├── config.py             # Config definitions
│   ├── logger.py             # Custom logging conf
│   ├── api/                  # API module
│   │   ├── __init__.py
│   │   ├── admin/            # Admin actions routes (manage feedbacks, manage partners lists)
│   │   │   └── ...
│   │   ├── auth/             # Authentication routes (simple log in reqeusts)
│   │   │   └── ...
│   │   ├── crq/              # CRQ management routes (search CRQ, manage CRQ, send notification)
│   │   │   └── ...
│   │   ├── inc/              # INC management routes (search INC, send notification)
│   │   │   └── ...
│   │   └── main/             # Main routes (home, dashboard, subscriptions)
│   │       └── ...
│   ├── core/    
│   │   ├── __init__.py            
│   │   ├── models/           # Flask-SQLAlchemy DB/Table models definitions
│   │   │   └── ...
│   │   └── services/         # Module contains definitions of business logic classes
│   │       └── ...
│   ├── logs/                 # Logs will be stored here
│   │   └── ...
│   ├── static/               # Static contains JS scripts and css styles
│   │   ├── css/              # CSS style sheets
│   │   │   └── ...
│   │   ├── img/              # Images
│   │   │   └── ...
│   │   └── js/               # JS scripts
│   │       └── ...
│   ├── templates/            # Templates contains HTML templates
│   │   └── ...
│   └── utils/                # Utils module. Contains helper functions
│   │   └── ...
├── instance/
│   └── ...                   # Place .env in here
├── uploads/
│   └── ...                   # Files will be stored in here
├── gunicorn_config.py        # gunicorn executable
├── requirements.txt          # Libraries required for installation
└── run.py                    # Application executable
```

## Contact

**hidden**
**hidden**
**hidden**
**hidden**
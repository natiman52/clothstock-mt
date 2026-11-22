#!/bin/sh
set -e

echo "Checking external service connectivity..."
python <<'PY'
import os, sys, time
import MySQLdb


# ── 1. Wait for MySQL ──────────────────────────────────────────────────────────
host     = os.environ.get("DB_HOST", "db")
port     = int(os.environ.get("MYSQL_PORT", "3306"))
user     = os.environ.get("MYSQL_USER", "")
password = os.environ.get("MYSQL_ROOT_PASSWORD", "")
name     = os.environ.get("MYSQL_DATABASE", "")

for attempt in range(30):
    try:
        conn = MySQLdb.connect(host=host, port=port, user=user, passwd=password, db=name)
        conn.close()
        print("Database (MySQL) is ready.")
        break
    except MySQLdb.OperationalError as exc:
        print(f"  MySQL not ready ({exc}); retry {attempt + 1}/30...")
        time.sleep(2)
else:
    sys.exit("ERROR: MySQL did not become ready in time.")
PY

# ── 3. Migrations & static collection ─────────────────────────────────────────
# Only the primary web container runs migrations to avoid race conditions when
# celery-worker and celery-beat start concurrently (set RUN_MIGRATIONS=true on
# the backend/web service only).
if [ "$RUN_MIGRATIONS" = "true" ]; then
    echo "Running migrations"
    python manage.py makemigrations
    echo "Running database migrations..."
    python manage.py migrate --noinput
    echo "Collecting static assets..."
    python manage.py collectstatic --noinput

    echo "Creating or updating default admin superuser (admin/admin)..."
    python manage.py shell <<'PY'
from django.contrib.auth import get_user_model
User = get_user_model()
username = 'admin'
password = 'admin'

if not User.objects.filter(username=username).exists():
    user = User.objects.create_superuser(username=username,  password=password)
    if hasattr(user, 'status') and hasattr(User, 'Status'):
        user.status = User.Status.OWNER
        user.save()
    print("Default superuser 'admin' created successfully.")
else:
    user = User.objects.get(username=username)
    user.set_password(password)
    user.is_superuser = True
    user.is_staff = True
    if hasattr(user, 'status') and hasattr(User, 'Status'):
        user.status = User.Status.OWNER
    user.save()
    print("Default superuser 'admin' credentials refreshed.")
PY
fi

exec "$@"

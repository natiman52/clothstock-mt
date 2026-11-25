from django.db import migrations, models


def finalize_awaiting_events(apps, schema_editor):
    SyncEvent = apps.get_model('inventory', 'SyncEvent')
    SyncEvent.objects.filter(status='AWAITING_CONFIRMATION').update(status='PROCESSED')


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0011_acknowledged_sync'),
    ]

    operations = [
        migrations.RunPython(finalize_awaiting_events, migrations.RunPython.noop),
        migrations.DeleteModel(name='SyncAcknowledgement'),
        migrations.DeleteModel(name='SyncConfirm'),
        migrations.DeleteModel(name='SyncBatch'),
        migrations.RemoveField(
            model_name='storesyncstate',
            name='sync_version',
        ),
        migrations.RemoveField(
            model_name='storesyncstate',
            name='status_payload',
        ),
        migrations.AlterField(
            model_name='syncevent',
            name='status',
            field=models.CharField(
                choices=[
                    ('PENDING', 'Pending'),
                    ('PROCESSED', 'Processed'),
                    ('CONFLICT', 'Conflict'),
                    ('FAILED', 'Failed'),
                ],
                db_index=True,
                default='PENDING',
                max_length=50,
            ),
        ),
    ]
